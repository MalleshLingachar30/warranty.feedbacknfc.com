import { NextResponse, type NextRequest } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { clerkOrDbHasRole } from "@/lib/rbac";
import { runSlaSweep } from "@/lib/sla-engine";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authData = await getOptionalAuth();

    if (!authData.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleGuardDisabled =
      process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true";

    if (!roleGuardDisabled) {
      const hasRequiredRole = await clerkOrDbHasRole({
        clerkUserId: authData.userId,
        orgRole: authData.orgRole,
        sessionClaims: authData.sessionClaims,
        requiredRole: "technician",
      });

      if (!hasRequiredRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { id: ticketId } = await context.params;

    if (!ticketId) {
      return NextResponse.json(
        { error: "Ticket id is required." },
        { status: 400 },
      );
    }

    const [ticket, technician] = await Promise.all([
      db.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          status: true,
          ticketNumber: true,
          assignedTechnicianId: true,
          assignedServiceCenterId: true,
          assignedAt: true,
        },
      }),
      db.technician.findFirst({
        where: {
          user: {
            clerkId: authData.userId,
          },
        },
        select: {
          id: true,
          name: true,
          serviceCenterId: true,
        },
      }),
    ]);

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (!technician) {
      return NextResponse.json(
        {
          error:
            "Technician profile not found for this account. Ask your service center admin to add you.",
        },
        { status: 400 },
      );
    }

    if (
      ticket.assignedTechnicianId &&
      ticket.assignedTechnicianId !== technician.id
    ) {
      return NextResponse.json(
        { error: "Ticket is assigned to another technician." },
        { status: 403 },
      );
    }

    if (
      ticket.assignedServiceCenterId &&
      ticket.assignedServiceCenterId !== technician.serviceCenterId
    ) {
      return NextResponse.json(
        { error: "Technician does not belong to the assigned service center." },
        { status: 403 },
      );
    }

    if (ticket.status === "assigned") {
      return NextResponse.json({
        success: true,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: "assigned",
      });
    }

    if (ticket.status !== "awaiting_technician_acceptance") {
      return NextResponse.json(
        {
          error:
            "Only tickets awaiting technician acceptance can be accepted.",
        },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "assigned",
          assignedTechnicianId: technician.id,
          assignedServiceCenterId:
            ticket.assignedServiceCenterId ?? technician.serviceCenterId,
          assignedAt: ticket.assignedAt ?? new Date(),
        },
      }),
      db.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "assigned",
          eventDescription: `${technician.name} accepted the service job.`,
          actorRole: "technician",
          actorName: technician.name,
        },
      }),
    ]);

    await runSlaSweep({ ticketId: ticket.id });

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: "assigned",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to accept ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

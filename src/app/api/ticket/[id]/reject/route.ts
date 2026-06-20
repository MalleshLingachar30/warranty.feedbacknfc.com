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
        requiredRole: "field_technician",
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
          activeJobCount: true,
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

    if (ticket.status === "escalated") {
      return NextResponse.json({
        success: true,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: "escalated",
      });
    }

    if (ticket.status !== "awaiting_technician_acceptance") {
      return NextResponse.json(
        {
          error:
            "Only tickets awaiting technician acceptance can be rejected.",
        },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "escalated",
          assignedTechnicianId: null,
          assignmentMethod: "escalated",
          assignmentNotes: `${technician.name} rejected the AI-assigned service job.`,
          escalationLevel: {
            increment: 1,
          },
          escalatedAt: new Date(),
          escalationReason:
            "Assigned technician rejected the service job and requires manual reassignment.",
        },
      }),
      db.technician.update({
        where: { id: technician.id },
        data: {
          activeJobCount: Math.max(0, technician.activeJobCount - 1),
        },
      }),
      db.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "assignment_escalated",
          eventDescription: `${technician.name} rejected the service job. Manual reassignment required.`,
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
      status: "escalated",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reject ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

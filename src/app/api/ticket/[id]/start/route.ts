import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { clerkOrDbHasRole } from "@/lib/rbac";
import { writeScanLog } from "@/lib/scan-log";
import { runSlaSweep } from "@/lib/sla-engine";
import { sendCustomerWorkStartedNotification } from "@/lib/warranty-notifications";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authData = await auth();

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

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        ticketNumber: true,
        assignedTechnicianId: true,
        assignedServiceCenterId: true,
        technicianStartedAt: true,
        productId: true,
        product: {
          select: {
            customerPhone: true,
            customerName: true,
            sticker: {
              select: {
                stickerNumber: true,
              },
            },
            customer: {
              select: {
                languagePreference: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (
      ticket.status !== "assigned" &&
      ticket.status !== "technician_enroute" &&
      ticket.status !== "work_in_progress"
    ) {
      return NextResponse.json(
        { error: "Ticket cannot be started from the current status." },
        { status: 409 },
      );
    }

    const technician = await db.technician.findFirst({
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
    });

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

    const startedAt = ticket.technicianStartedAt ?? new Date();

    await db.$transaction([
      db.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "work_in_progress",
          assignedTechnicianId: technician.id,
          technicianStartedAt: startedAt,
        },
      }),
      db.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "technician_started",
          eventDescription: `${technician.name} started work on site.`,
          actorRole: "technician",
          actorName: technician.name,
        },
      }),
    ]);

    await runSlaSweep({ ticketId: ticket.id });

    if (ticket.product.customerPhone) {
      void sendCustomerWorkStartedNotification({
        customerPhone: ticket.product.customerPhone,
        customerName: ticket.product.customerName ?? "Customer",
        ticketNumber: ticket.ticketNumber,
        languagePreference: ticket.product.customer?.languagePreference,
      });
    }

    void writeScanLog({
      stickerNumber: ticket.product.sticker.stickerNumber,
      productId: ticket.productId,
      viewerType: "technician",
      actionTaken: "started_work",
      userAgent: _request.headers.get("user-agent"),
      ipAddress:
        _request.headers.get("x-forwarded-for") ??
        _request.headers.get("x-real-ip"),
    });

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: "work_in_progress",
      technicianStartedAt: startedAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { runSlaSweep } from "@/lib/sla-engine";
import { resolveTechnicianId } from "@/lib/technician-context";
import { sendCustomerWorkStartedNotification } from "@/lib/warranty-notifications";

export const runtime = "nodejs";

interface StartRequestBody {
  technicianId?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ticketId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as StartRequestBody;
    const requestedTechnicianId = resolveTechnicianId(request, body);

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
        product: {
          select: {
            customerPhone: true,
            customerName: true,
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

    const actingTechnicianId =
      ticket.assignedTechnicianId ?? requestedTechnicianId;

    if (!actingTechnicianId) {
      return NextResponse.json(
        { error: "technicianId is required to start this ticket." },
        { status: 400 },
      );
    }

    if (
      ticket.assignedTechnicianId &&
      ticket.assignedTechnicianId !== actingTechnicianId
    ) {
      return NextResponse.json(
        { error: "Ticket is assigned to another technician." },
        { status: 403 },
      );
    }

    const technician = await db.technician.findUnique({
      where: { id: actingTechnicianId },
      select: {
        id: true,
        name: true,
        serviceCenterId: true,
      },
    });

    if (!technician) {
      return NextResponse.json(
        { error: "Technician profile not found." },
        { status: 404 },
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
      });
    }

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

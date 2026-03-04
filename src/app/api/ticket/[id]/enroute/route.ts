import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { resolveTechnicianId } from "@/lib/technician-context";

export const runtime = "nodejs";

interface EnrouteRequestBody {
  technicianId?: string;
  etaMinutes?: number;
}

function readEtaMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 45;
  }

  const normalized = Math.floor(value);
  return Math.max(10, Math.min(180, normalized));
}

function metadataAsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ticketId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as EnrouteRequestBody;
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
        assignedAt: true,
        metadata: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (
      ticket.status !== "assigned" &&
      ticket.status !== "technician_enroute"
    ) {
      return NextResponse.json(
        {
          error: "Only assigned tickets can be marked as technician en route.",
        },
        { status: 409 },
      );
    }

    const actingTechnicianId =
      ticket.assignedTechnicianId ?? requestedTechnicianId;

    if (!actingTechnicianId) {
      return NextResponse.json(
        { error: "technicianId is required to accept this job." },
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

    const etaMinutes = readEtaMinutes(body.etaMinutes);
    const etaLabel = `${etaMinutes} mins`;
    const metadata = metadataAsObject(ticket.metadata);

    await db.$transaction([
      db.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "technician_enroute",
          assignedTechnicianId: technician.id,
          assignedServiceCenterId:
            ticket.assignedServiceCenterId ?? technician.serviceCenterId,
          assignedAt: ticket.assignedAt ?? new Date(),
          metadata: {
            ...metadata,
            etaLabel,
            technicianEnrouteAt: new Date().toISOString(),
          },
        },
      }),
      db.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "technician_enroute",
          eventDescription: `${technician.name} accepted the job and started navigation. ETA ${etaLabel}.`,
          actorRole: "technician",
          actorName: technician.name,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: "technician_enroute",
      etaLabel,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to mark ticket as en route";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

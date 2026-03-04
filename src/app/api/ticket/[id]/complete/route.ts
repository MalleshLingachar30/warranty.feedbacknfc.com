import { NextResponse, type NextRequest } from "next/server";

import { resolveTechnicianId } from "@/lib/technician-context";
import { completeTicket } from "@/lib/warranty-store";
import type { WarrantyTicketPartUsed } from "@/lib/warranty-types";

export const runtime = "nodejs";

interface CompleteTicketRequest {
  technicianId?: string;
  resolutionNotes?: string;
  beforePhotos?: string[];
  afterPhotos?: string[];
  partsUsed?: WarrantyTicketPartUsed[];
  laborHours?: number;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body = (await request.json()) as CompleteTicketRequest;

    if (!body.resolutionNotes || body.resolutionNotes.trim().length < 10) {
      return NextResponse.json(
        { error: "Resolution notes must be at least 10 characters." },
        { status: 400 }
      );
    }

    const technicianId = resolveTechnicianId(request, body);

    const ticket = await completeTicket(params.id, technicianId, {
      resolutionNotes: body.resolutionNotes,
      beforePhotos: Array.isArray(body.beforePhotos)
        ? body.beforePhotos.filter((entry) => typeof entry === "string")
        : [],
      afterPhotos: Array.isArray(body.afterPhotos)
        ? body.afterPhotos.filter((entry) => typeof entry === "string")
        : [],
      partsUsed: Array.isArray(body.partsUsed)
        ? body.partsUsed.filter((part) =>
            Boolean(part) &&
            typeof part.partName === "string" &&
            typeof part.partNumber === "string" &&
            typeof part.cost === "number"
          )
        : [],
      laborHours: typeof body.laborHours === "number" ? body.laborHours : 0,
    });

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      status: ticket.status,
      technicianCompletedAt: ticket.technicianCompletedAt,
      claimValue: ticket.claimValue,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

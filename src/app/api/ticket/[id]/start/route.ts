import { NextResponse, type NextRequest } from "next/server";

import { resolveTechnicianId } from "@/lib/technician-context";
import { markTicketStarted } from "@/lib/warranty-store";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body = (await request.json().catch(() => ({}))) as { technicianId?: string };
    const technicianId = resolveTechnicianId(request, body);

    const ticket = await markTicketStarted(params.id, technicianId);

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      status: ticket.status,
      technicianStartedAt: ticket.technicianStartedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Ticket id is required." },
        { status: 400 },
      );
    }

    const ticket = await db.ticket.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        issueCategory: true,
        issueDescription: true,
        reportedAt: true,
        assignedAt: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
        customerConfirmedAt: true,
        closedAt: true,
        assignedTechnician: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        timelineEntries: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            eventType: true,
            eventDescription: true,
            actorName: true,
            actorRole: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    return NextResponse.json({
      ticket: {
        ...ticket,
        reportedAt: ticket.reportedAt.toISOString(),
        assignedAt: ticket.assignedAt?.toISOString() ?? null,
        technicianStartedAt: ticket.technicianStartedAt?.toISOString() ?? null,
        technicianCompletedAt:
          ticket.technicianCompletedAt?.toISOString() ?? null,
        customerConfirmedAt: ticket.customerConfirmedAt?.toISOString() ?? null,
        closedAt: ticket.closedAt?.toISOString() ?? null,
        timeline: ticket.timelineEntries.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Ticket status lookup failed", error);
    return NextResponse.json(
      { error: "Unable to fetch ticket status." },
      { status: 500 },
    );
  }
}

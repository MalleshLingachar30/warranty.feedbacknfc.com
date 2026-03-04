import { NextResponse } from "next/server";

import { db as prisma } from "@/lib/db";

interface TicketConfirmationRequest {
  action?: "confirm" | "reopen";
  comment?: string;
}

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveParams(context: RouteContext): Promise<{ id: string }> {
  const maybePromise = context.params as Promise<{ id: string }>;

  if (typeof maybePromise?.then === "function") {
    return maybePromise;
  }

  return context.params as { id: string };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await resolveParams(context);
    const body = (await request.json()) as TicketConfirmationRequest;
    const action = body.action ?? "confirm";

    if (!id) {
      return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
    }

    if (action !== "confirm" && action !== "reopen") {
      return NextResponse.json(
        { error: "Action must be either 'confirm' or 'reopen'." },
        { status: 400 },
      );
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (action === "confirm") {
      const now = new Date();

      const [updatedTicket] = await prisma.$transaction([
        prisma.ticket.update({
          where: { id },
          data: {
            status: "resolved",
            customerConfirmedAt: now,
            closedAt: now,
          },
        }),
        prisma.ticketTimeline.create({
          data: {
            ticketId: id,
            eventType: "confirmed",
            eventDescription:
              body.comment ?? "Customer confirmed service resolution.",
            actorRole: "customer",
            actorName: "Customer",
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: `Resolution confirmed for ${ticket.ticketNumber}.`,
        ticket: updatedTicket,
      });
    }

    const [reopenedTicket] = await prisma.$transaction([
      prisma.ticket.update({
        where: { id },
        data: {
          status: "reopened",
          escalationLevel: {
            increment: 1,
          },
          escalationReason:
            body.comment ?? "Customer marked issue as unresolved after repair.",
        },
      }),
      prisma.ticketTimeline.create({
        data: {
          ticketId: id,
          eventType: "reopened",
          eventDescription:
            body.comment ?? "Customer reported issue not resolved.",
          actorRole: "customer",
          actorName: "Customer",
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Ticket ${ticket.ticketNumber} has been reopened.`,
      ticket: reopenedTicket,
    });
  } catch (error) {
    console.error("Ticket confirmation failed", error);
    return NextResponse.json(
      { error: "Unable to update ticket status." },
      { status: 500 },
    );
  }
}

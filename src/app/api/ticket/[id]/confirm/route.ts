import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";

import { db as prisma } from "@/lib/db";
import { runSlaSweep } from "@/lib/sla-engine";
import {
  sendManufacturerClaimSubmittedEmail,
  sendTechnicianResolutionConfirmedNotification,
} from "@/lib/warranty-notifications";

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

const DEFAULT_LABOR_RATE_PER_HOUR = 550;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(String(value));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parsePartsUsed(value: unknown): Array<{
  partName: string;
  partNumber: string;
  cost: number;
  quantity: number;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const partName =
        typeof candidate.partName === "string" ? candidate.partName.trim() : "";

      if (!partName) {
        return null;
      }

      const partNumber =
        typeof candidate.partNumber === "string"
          ? candidate.partNumber.trim()
          : "";

      return {
        partName,
        partNumber,
        cost: Math.max(0, toNumber(candidate.cost, 0)),
        quantity: Math.max(1, Math.floor(toNumber(candidate.quantity, 1))),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        partName: string;
        partNumber: string;
        cost: number;
        quantity: number;
      } => Boolean(entry),
    );
}

async function generateClaimNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const count = await tx.warrantyClaim.count({
    where: {
      createdAt: {
        gte: yearStart,
        lt: yearEnd,
      },
    },
  });

  return `CLM-${year}-${String(count + 1).padStart(6, "0")}`;
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
        productId: true,
        claimId: true,
        product: {
          select: {
            organizationId: true,
          },
        },
        assignedServiceCenter: {
          select: {
            organizationId: true,
          },
        },
        assignedTechnician: {
          select: {
            phone: true,
            serviceCenter: {
              select: {
                organizationId: true,
              },
            },
          },
        },
        issuePhotos: true,
        resolutionPhotos: true,
        reportedAt: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
        resolutionNotes: true,
        partsUsed: true,
        laborHours: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (action === "confirm") {
      if (
        ticket.status !== "pending_confirmation" &&
        ticket.status !== "resolved"
      ) {
        return NextResponse.json(
          { error: "Ticket is not waiting for customer confirmation." },
          { status: 409 },
        );
      }

      const now = new Date();
      const serviceCenterOrgId =
        ticket.assignedServiceCenter?.organizationId ??
        ticket.assignedTechnician?.serviceCenter.organizationId ??
        null;

      const result = await prisma.$transaction(async (tx) => {
        const updatedTicket = await tx.ticket.update({
          where: { id },
          data: {
            status: "resolved",
            customerConfirmedAt: now,
            closedAt: now,
          },
        });

        await tx.ticketTimeline.create({
          data: {
            ticketId: id,
            eventType: "confirmed",
            eventDescription:
              body.comment ?? "Customer confirmed service resolution.",
            actorRole: "customer",
            actorName: "Customer",
          },
        });

        let generatedClaim:
          | {
              id: string;
              claimNumber: string;
            }
          | null = null;

        const existingClaim = await tx.warrantyClaim.findUnique({
          where: {
            ticketId: id,
          },
          select: {
            id: true,
            claimNumber: true,
          },
        });

        if (!existingClaim && serviceCenterOrgId) {
          const partsUsed = parsePartsUsed(ticket.partsUsed);
          const partsCost = partsUsed.reduce(
            (sum, part) => sum + part.cost * part.quantity,
            0,
          );
          const laborHours = Math.max(0, toNumber(ticket.laborHours, 0));
          const laborCost = laborHours * DEFAULT_LABOR_RATE_PER_HOUR;
          const totalClaimAmount = Number((partsCost + laborCost).toFixed(2));

          const claimNumber = await generateClaimNumber(tx);
          const createdClaim = await tx.warrantyClaim.create({
            data: {
              claimNumber,
              ticketId: ticket.id,
              productId: ticket.productId,
              manufacturerOrgId: ticket.product.organizationId,
              serviceCenterOrgId,
              claimType: "warranty_repair",
              partsCost: Number(partsCost.toFixed(2)),
              laborCost: Number(laborCost.toFixed(2)),
              totalClaimAmount,
              documentation: {
                photos: [...ticket.issuePhotos, ...ticket.resolutionPhotos],
                timestamps: [
                  ticket.reportedAt.toISOString(),
                  ticket.technicianStartedAt?.toISOString(),
                  ticket.technicianCompletedAt?.toISOString(),
                  now.toISOString(),
                ].filter(Boolean),
                partsUsed: partsUsed.map((part) => part.partName),
                technicianNotes: ticket.resolutionNotes ?? "",
                autoGeneratedAt: now.toISOString(),
              } as Prisma.InputJsonValue,
              status: "auto_generated",
            },
            select: {
              id: true,
              claimNumber: true,
            },
          });

          generatedClaim = createdClaim;

          await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              claimId: createdClaim.id,
            },
          });

          await tx.ticketTimeline.create({
            data: {
              ticketId: ticket.id,
              eventType: "claim_auto_generated",
              eventDescription: `Warranty claim ${createdClaim.claimNumber} auto-generated after customer confirmation.`,
              actorRole: "system",
              actorName: "Warranty Engine",
            },
          });
        }

        return {
          updatedTicket,
          generatedClaim,
        };
      });

      if (result.generatedClaim) {
        const claimNotification = await prisma.warrantyClaim.findUnique({
          where: {
            id: result.generatedClaim.id,
          },
          select: {
            claimNumber: true,
            totalClaimAmount: true,
            manufacturerOrg: {
              select: {
                name: true,
                contactEmail: true,
              },
            },
            serviceCenterOrg: {
              select: {
                name: true,
              },
            },
          },
        });

        const manufacturerEmail =
          claimNotification?.manufacturerOrg.contactEmail ?? "";

        if (claimNotification && manufacturerEmail) {
          void sendManufacturerClaimSubmittedEmail({
            manufacturerEmail,
            manufacturerName: claimNotification.manufacturerOrg.name,
            claimNumber: claimNotification.claimNumber,
            ticketNumber: ticket.ticketNumber,
            serviceCenterName: claimNotification.serviceCenterOrg.name,
            claimAmount: toNumber(claimNotification.totalClaimAmount),
          });
        }
      }

      if (ticket.assignedTechnician?.phone) {
        void sendTechnicianResolutionConfirmedNotification({
          technicianPhone: ticket.assignedTechnician.phone,
          ticketNumber: ticket.ticketNumber,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Resolution confirmed for ${ticket.ticketNumber}.`,
        ticket: result.updatedTicket,
        claim: result.generatedClaim,
      });
    }

    if (
      ticket.status !== "pending_confirmation" &&
      ticket.status !== "resolved"
    ) {
      return NextResponse.json(
        { error: "Ticket cannot be reopened from the current state." },
        { status: 409 },
      );
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

    await runSlaSweep({ ticketId: reopenedTicket.id });

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

import { type Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { clerkOrDbHasRole } from "@/lib/rbac";
import { runSlaSweep } from "@/lib/sla-engine";
import { sendCustomerCompletionPrompt } from "@/lib/warranty-notifications";

export const runtime = "nodejs";

const MAX_PHOTO_COUNT = 10;
const DEFAULT_LABOR_RATE_PER_HOUR = 550;

interface CompleteTicketPartInput {
  partName?: string;
  partNumber?: string;
  cost?: number;
  quantity?: number;
}

interface CompleteTicketRequest {
  resolutionNotes?: string;
  beforePhotos?: string[];
  afterPhotos?: string[];
  partsUsed?: CompleteTicketPartInput[];
  laborHours?: number;
}

interface NormalizedPartUsed {
  partName: string;
  partNumber: string;
  cost: number;
  quantity: number;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizePhotoUrls(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, MAX_PHOTO_COUNT);
}

function sanitizeParts(values: unknown): NormalizedPartUsed[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const candidate = entry as CompleteTicketPartInput;
      const partName = asNonEmptyString(candidate.partName);

      if (!partName) {
        return null;
      }

      return {
        partName,
        partNumber: asNonEmptyString(candidate.partNumber) ?? "",
        cost: Math.max(0, toNumber(candidate.cost, 0)),
        quantity: Math.max(1, Math.floor(toNumber(candidate.quantity, 1))),
      } satisfies NormalizedPartUsed;
    })
    .filter((entry): entry is NormalizedPartUsed => Boolean(entry));
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
    const body = (await request.json()) as CompleteTicketRequest;

    if (!ticketId) {
      return NextResponse.json(
        { error: "Ticket id is required." },
        { status: 400 },
      );
    }

    if (!body.resolutionNotes || body.resolutionNotes.trim().length < 10) {
      return NextResponse.json(
        { error: "Resolution notes must be at least 10 characters." },
        { status: 400 },
      );
    }

    const beforePhotos = sanitizePhotoUrls(body.beforePhotos);
    const afterPhotos = sanitizePhotoUrls(body.afterPhotos);

    if (beforePhotos.length + afterPhotos.length > MAX_PHOTO_COUNT) {
      return NextResponse.json(
        {
          error: `Upload a maximum of ${MAX_PHOTO_COUNT} total before/after photos.`,
        },
        { status: 400 },
      );
    }

    const partsUsed = sanitizeParts(body.partsUsed);
    const laborHours = Math.max(0, toNumber(body.laborHours, 0));

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        ticketNumber: true,
        assignedTechnicianId: true,
        assignedServiceCenterId: true,
        metadata: true,
        product: {
          select: {
            customerPhone: true,
            customerName: true,
            sticker: {
              select: {
                stickerNumber: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (ticket.status !== "work_in_progress") {
      return NextResponse.json(
        {
          error: "Only tickets in work_in_progress can be completed.",
        },
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
        activeJobCount: true,
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

    const completedAt = new Date();
    const existingMetadata = metadataAsObject(ticket.metadata);

    const partsCost = partsUsed.reduce(
      (total, part) => total + part.cost * part.quantity,
      0,
    );
    const laborCost = laborHours * DEFAULT_LABOR_RATE_PER_HOUR;
    const claimValue = Number((partsCost + laborCost).toFixed(2));

    await db.$transaction([
      db.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "pending_confirmation",
          resolutionNotes: body.resolutionNotes.trim(),
          resolutionPhotos: [...beforePhotos, ...afterPhotos],
          partsUsed: partsUsed as unknown as Prisma.InputJsonValue,
          laborHours,
          technicianCompletedAt: completedAt,
          metadata: {
            ...existingMetadata,
            completion: {
              beforePhotos,
              afterPhotos,
              partsCost,
              laborCost,
              estimatedClaimValue: claimValue,
              completedAt: completedAt.toISOString(),
            },
          },
        },
      }),
      db.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "work_completed",
          eventDescription: `${technician.name} marked work as complete. Awaiting customer confirmation.`,
          actorRole: "technician",
          actorName: technician.name,
          metadata: {
            laborHours,
            partsUsed,
          } as unknown as Prisma.InputJsonValue,
        },
      }),
      db.technician.update({
        where: { id: technician.id },
        data: {
          totalJobsCompleted: {
            increment: 1,
          },
          ...(technician.activeJobCount > 0
            ? {
                activeJobCount: {
                  decrement: 1,
                },
              }
            : {}),
        },
      }),
    ]);

    await runSlaSweep({ ticketId: ticket.id });

    if (ticket.product.customerPhone) {
      void sendCustomerCompletionPrompt({
        customerPhone: ticket.product.customerPhone,
        customerName: ticket.product.customerName ?? "Customer",
        ticketNumber: ticket.ticketNumber,
        stickerNumber: ticket.product.sticker.stickerNumber,
      });
    }

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: "pending_confirmation",
      technicianCompletedAt: completedAt.toISOString(),
      claimValue,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

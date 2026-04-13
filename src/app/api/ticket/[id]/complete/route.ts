import { type Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import {
  parsePartUsageInputs,
  resolvePartUsages,
  toJobPartUsageCreateManyInput,
  toTicketPartsSnapshot,
  validatePartUsagePolicy,
} from "@/lib/job-part-usage";
import { clerkOrDbHasRole } from "@/lib/rbac";
import { writeScanLog } from "@/lib/scan-log";
import { runSlaSweep } from "@/lib/sla-engine";
import { stopTrackingForTicket } from "@/lib/ticket-live-tracking";
import { sendCustomerCompletionPrompt } from "@/lib/warranty-notifications";

export const runtime = "nodejs";

const MAX_PHOTO_COUNT = 10;
const DEFAULT_LABOR_RATE_PER_HOUR = 550;

interface CompleteTicketRequest {
  resolutionNotes?: string;
  beforePhotos?: string[];
  afterPhotos?: string[];
  partUsages?: unknown;
  laborHours?: number;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
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

function metadataAsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function resolveMainAssetForTicket(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    productModelId: string;
    serialNumber: string | null;
  },
) {
  const serialNumber = input.serialNumber?.trim();
  if (!serialNumber) {
    return null;
  }

  return tx.assetIdentity.findFirst({
    where: {
      organizationId: input.organizationId,
      productModelId: input.productModelId,
      productClass: "main_product",
      serialNumber,
    },
    select: {
      id: true,
      publicCode: true,
    },
  });
}

export async function POST(
  request: NextRequest,
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
    const resolutionNotes = body.resolutionNotes.trim();

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

    const parsedPartUsages = parsePartUsageInputs({
      value: body.partUsages,
      defaultUsageType: "consumed",
    });
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
        productId: true,
        product: {
          select: {
            organizationId: true,
            productModelId: true,
            serialNumber: true,
            customerPhone: true,
            customerName: true,
            customer: {
              select: {
                languagePreference: true,
              },
            },
            installationLocation: true,
            productModel: {
              select: {
                partTraceabilityMode: true,
                smallPartTrackingMode: true,
              },
            },
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
        userId: true,
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
    const traceabilityRequired =
      ticket.product.productModel.partTraceabilityMode !== "none";

    const completionResult = await db.$transaction(async (tx) => {
      const mainAsset = await resolveMainAssetForTicket(tx, {
        organizationId: ticket.product.organizationId,
        productModelId: ticket.product.productModelId,
        serialNumber: ticket.product.serialNumber,
      });

      const resolvedPartUsages = await resolvePartUsages(tx, {
        organizationId: ticket.product.organizationId,
        parsedUsages: parsedPartUsages,
      });

      if ((traceabilityRequired || resolvedPartUsages.length > 0) && !mainAsset) {
        throw new Error(
          "Main product asset could not be resolved for this ticket. Ensure the product is linked to a serialized asset before recording part usage.",
        );
      }

      if (mainAsset) {
        await validatePartUsagePolicy(tx, {
          policy: {
            partTraceabilityMode: ticket.product.productModel.partTraceabilityMode,
            smallPartTrackingMode:
              ticket.product.productModel.smallPartTrackingMode,
            includedKitDefinition: {} as Prisma.JsonObject,
          },
          mainAssetId: mainAsset.id,
          resolvedUsages: resolvedPartUsages,
          workObjectLabel: `ticket ${ticket.ticketNumber}`,
          requireCaptureForPolicy: traceabilityRequired,
        });
      }

      const ticketPartsSnapshot = toTicketPartsSnapshot(resolvedPartUsages);
      const partsCost = ticketPartsSnapshot.partsCost;
      const laborCost = laborHours * DEFAULT_LABOR_RATE_PER_HOUR;
      const claimValue = Number((partsCost + laborCost).toFixed(2));

      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "pending_confirmation",
          resolutionNotes,
          resolutionPhotos: [...beforePhotos, ...afterPhotos],
          partsUsed: ticketPartsSnapshot.partsUsedJson,
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
              partUsageCount: resolvedPartUsages.length,
              completedAt: completedAt.toISOString(),
            },
          },
        },
      });

      await tx.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "work_completed",
          eventDescription: `${technician.name} marked work as complete. Awaiting customer confirmation.`,
          actorRole: "technician",
          actorName: technician.name,
          metadata: {
            laborHours,
            partUsages: ticketPartsSnapshot.partsUsedJson,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      if (mainAsset && resolvedPartUsages.length > 0) {
        await tx.jobPartUsage.createMany({
          data: toJobPartUsageCreateManyInput({
            mainAssetId: mainAsset.id,
            ticketId: ticket.id,
            linkedByUserId: technician.userId,
            resolvedUsages: resolvedPartUsages,
          }),
        });
      }

      await tx.technician.update({
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
      });

      return {
        claimValue,
      };
    });

    await stopTrackingForTicket({
      ticketId: ticket.id,
      reason: "ticket_pending_confirmation",
      actorRole: "technician",
      ticketMetadata: ticket.metadata,
      productInstallationLocation: ticket.product.installationLocation,
    });

    await runSlaSweep({ ticketId: ticket.id });

    if (ticket.product.customerPhone) {
      void sendCustomerCompletionPrompt({
        customerPhone: ticket.product.customerPhone,
        customerName: ticket.product.customerName ?? "Customer",
        ticketNumber: ticket.ticketNumber,
        stickerNumber: ticket.product.sticker.stickerNumber,
        languagePreference: ticket.product.customer?.languagePreference,
      });
    }

    void writeScanLog({
      stickerNumber: ticket.product.sticker.stickerNumber,
      productId: ticket.productId,
      viewerType: "technician",
      actionTaken: "completed_work",
      userAgent: request.headers.get("user-agent"),
      ipAddress:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip"),
    });

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: "pending_confirmation",
      technicianCompletedAt: completedAt.toISOString(),
      claimValue: completionResult.claimValue,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

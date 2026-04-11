import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db as prisma } from "@/lib/db";
import { authorizeOwnerAccess } from "@/lib/otp-session";
import { writeScanLog } from "@/lib/scan-log";
import { runSlaSweep } from "@/lib/sla-engine";
import { stopTrackingForTicket } from "@/lib/ticket-live-tracking";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";
import {
  sendTechnicianResolutionConfirmedNotification,
} from "@/lib/warranty-notifications";

interface TicketConfirmationRequest {
  action?: "confirm" | "reopen";
  comment?: string;
  rating?: number;
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
const MAX_CLAIM_NUMBER_ATTEMPTS = 5;

class ClaimNumberCollisionError extends Error {
  constructor() {
    super("Unable to allocate a unique claim number.");
    this.name = "ClaimNumberCollisionError";
  }
}

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

type GenericRecord = Record<string, unknown>;

function asRecord(value: unknown): GenericRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as GenericRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRating(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }

  return parsed;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function formatTimelineLabel(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

function formatDateLabel(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function readCompletionPhotos(metadata: unknown): {
  beforePhotos: string[];
  afterPhotos: string[];
} {
  const root = asRecord(metadata);
  const completion = asRecord(root.completion);

  return {
    beforePhotos: asStringArray(completion.beforePhotos),
    afterPhotos: asStringArray(completion.afterPhotos),
  };
}

function firstFiniteNumber(candidates: number[]): number {
  for (const candidate of candidates) {
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return Number.NaN;
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
  const claimNumberPrefix = `CLM-${year}-`;

  const latestClaimForYear = await tx.warrantyClaim.findFirst({
    where: {
      claimNumber: {
        startsWith: claimNumberPrefix,
      },
    },
    orderBy: {
      claimNumber: "desc",
    },
    select: {
      claimNumber: true,
    },
  });
  const latestSequence = latestClaimForYear?.claimNumber.match(
    new RegExp(`^CLM-${year}-(\\d+)$`),
  );
  const nextSequence =
    latestSequence && latestSequence[1]
      ? Number.parseInt(latestSequence[1], 10) + 1
      : 1;

  return `CLM-${year}-${String(nextSequence).padStart(6, "0")}`;
}

function isClaimNumberUniqueCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  if (typeof target === "string") {
    return (
      target.includes("claimNumber") ||
      target.includes("claim_number") ||
      target.includes("warranty_claims_claim_number_key")
    );
  }

  if (Array.isArray(target)) {
    return target.some(
      (entry) =>
        typeof entry === "string" &&
        (entry.includes("claimNumber") || entry.includes("claim_number")),
    );
  }

  return false;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await resolveParams(context);
    const body = (await request.json()) as TicketConfirmationRequest;
    const action = body.action ?? "confirm";
    const comment = asString(body.comment);
    const rating = action === "confirm" ? asRating(body.rating) : null;

    if (!id) {
      return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
    }

    if (action !== "confirm" && action !== "reopen") {
      return NextResponse.json(
        { error: "Action must be either 'confirm' or 'reopen'." },
        { status: 400 },
      );
    }

    if (action === "confirm" && rating === null) {
      return NextResponse.json(
        { error: "Service rating must be an integer between 1 and 5." },
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
        issueCategory: true,
        issueDescription: true,
        issueSeverity: true,
        reportedByName: true,
        reportedByPhone: true,
        assignedAt: true,
        product: {
          select: {
            organizationId: true,
            customerName: true,
            customerPhone: true,
            customerEmail: true,
            customerAddress: true,
            customerCity: true,
            customerState: true,
            customerPincode: true,
            warrantyStartDate: true,
            warrantyEndDate: true,
            serialNumber: true,
            installationLocation: true,
            metadata: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
            organization: {
              select: {
                name: true,
                logoUrl: true,
              },
            },
            sticker: {
              select: {
                stickerNumber: true,
              },
            },
          },
        },
        assignedServiceCenter: {
          select: {
            organizationId: true,
            name: true,
          },
        },
        assignedTechnician: {
          select: {
            name: true,
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
        metadata: true,
        timelineEntries: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            eventType: true,
            eventDescription: true,
            actorName: true,
            actorRole: true,
            createdAt: true,
            metadata: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const authData = await getOptionalAuth();
    const ownerAccess = await authorizeOwnerAccess({
      cookiesStore: await cookies(),
      productId: ticket.productId,
      ownerPhone: ticket.product.customerPhone,
      clerkUserId: authData.userId,
    });

    if (!ownerAccess.valid) {
      return NextResponse.json(
        {
          error: "Owner verification required to confirm resolution.",
        },
        { status: 403 },
      );
    }

    if (action === "confirm") {
      const serviceRating = rating as number;

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
            customerServiceRating: serviceRating,
            closedAt: now,
          },
        });

        await tx.ticketTimeline.create({
          data: {
            ticketId: id,
            eventType: "confirmed",
            eventDescription:
              comment ??
              `Customer confirmed service resolution and rated service ${serviceRating}/5.`,
            actorUserId: ownerAccess.userId,
            actorRole: "customer",
            actorName: "Customer",
            metadata: {
              rating: serviceRating,
            },
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
          const partsDetailed = partsUsed.map((part) => ({
            partName: part.partName,
            partNumber: part.partNumber,
            quantity: part.quantity,
            cost: Number(part.cost.toFixed(2)),
            lineTotal: Number((part.cost * part.quantity).toFixed(2)),
          }));

          const completionPhotos = readCompletionPhotos(ticket.metadata);
          const locationRecord = asRecord(ticket.product.installationLocation);
          const completionMetadata = asRecord(asRecord(ticket.metadata).completion);
          const completionLocation = asRecord(completionMetadata.location);
          const gpsLocation = {
            latitude: firstFiniteNumber([
              toNumber(locationRecord.lat, Number.NaN),
              toNumber(locationRecord.latitude, Number.NaN),
              toNumber(completionLocation.lat, Number.NaN),
              toNumber(completionLocation.latitude, Number.NaN),
            ]),
            longitude: firstFiniteNumber([
              toNumber(locationRecord.lng, Number.NaN),
              toNumber(locationRecord.longitude, Number.NaN),
              toNumber(completionLocation.lng, Number.NaN),
              toNumber(completionLocation.longitude, Number.NaN),
            ]),
          };
          const hasGpsLocation =
            Number.isFinite(gpsLocation.latitude) &&
            Number.isFinite(gpsLocation.longitude);
          const claimId = crypto.randomUUID();
          const reportPath = `/api/claim/${claimId}/report?download=1`;
          const reportUrl = buildAbsoluteWarrantyUrl(reportPath);
          const nfcPath = `/nfc/${ticket.product.sticker.stickerNumber}`;
          const nfcUrl = buildAbsoluteWarrantyUrl(nfcPath);

          const workflowTimestamps = [
            { label: "Reported", at: ticket.reportedAt },
            ticket.assignedAt
              ? { label: "Assigned", at: ticket.assignedAt }
              : null,
            ticket.technicianStartedAt
              ? {
                  label: "Work Started",
                  at: ticket.technicianStartedAt,
                }
              : null,
            ticket.technicianCompletedAt
              ? {
                  label: "Work Completed",
                  at: ticket.technicianCompletedAt,
                }
              : null,
            { label: "Customer Confirmed", at: now },
          ]
            .filter((entry): entry is { label: string; at: Date } => Boolean(entry))
            .map((entry) => ({
              label: entry.label,
              at: entry.at.toISOString(),
              atLabel: formatDateLabel(entry.at),
            }));

          const timelineEvents = ticket.timelineEntries.map((entry) => ({
            eventType: entry.eventType,
            label: formatTimelineLabel(entry.eventType),
            description:
              entry.eventDescription ?? formatTimelineLabel(entry.eventType),
            actorName: entry.actorName ?? "System",
            actorRole: entry.actorRole ?? "system",
            createdAt: entry.createdAt.toISOString(),
            createdAtLabel: formatDateLabel(entry.createdAt),
          }));

          const issuePhotos = ticket.issuePhotos.filter(
            (photo) => typeof photo === "string" && photo.trim().length > 0,
          );
          const resolutionPhotos = ticket.resolutionPhotos.filter(
            (photo) => typeof photo === "string" && photo.trim().length > 0,
          );

          for (let attempt = 0; attempt < MAX_CLAIM_NUMBER_ATTEMPTS; attempt += 1) {
            const claimNumber = await generateClaimNumber(tx);

            const documentationPayload: Prisma.InputJsonValue = {
              claimNumber,
              generatedAt: now.toISOString(),
              generatedAtLabel: formatDateLabel(now),
              ticket: {
                ticketId: ticket.id,
                ticketNumber: ticket.ticketNumber,
                issueCategory: ticket.issueCategory ?? "General issue",
                issueDescription: ticket.issueDescription,
                issueSeverity: ticket.issueSeverity,
                reportedByName: ticket.reportedByName,
                reportedByPhone: ticket.reportedByPhone,
              },
              manufacturer: {
                organizationId: ticket.product.organizationId,
                name: ticket.product.organization.name,
                logoUrl: ticket.product.organization.logoUrl,
              },
              serviceCenter: {
                organizationId: serviceCenterOrgId,
                name: ticket.assignedServiceCenter?.name ?? "Service Center",
              },
              product: {
                productId: ticket.productId,
                name: ticket.product.productModel.name,
                modelNumber: ticket.product.productModel.modelNumber,
                serialNumber: ticket.product.serialNumber,
                warrantyStartDate:
                  ticket.product.warrantyStartDate?.toISOString() ?? null,
                warrantyEndDate:
                  ticket.product.warrantyEndDate?.toISOString() ?? null,
                stickerNumber: ticket.product.sticker.stickerNumber,
              },
              customer: {
                name: ticket.product.customerName ?? ticket.reportedByName ?? "Customer",
                phone: ticket.product.customerPhone ?? ticket.reportedByPhone,
                email: ticket.product.customerEmail,
                address: ticket.product.customerAddress,
                city: ticket.product.customerCity,
                state: ticket.product.customerState,
                pincode: ticket.product.customerPincode,
              },
              technician: {
                name: ticket.assignedTechnician?.name ?? null,
                phone: ticket.assignedTechnician?.phone ?? null,
              },
              notes: {
                technicianResolution: ticket.resolutionNotes ?? "",
                customerConfirmation:
                  comment ?? "Customer confirmed service resolution.",
                customerServiceRating: serviceRating,
              },
              photos: {
                issue: issuePhotos,
                before: completionPhotos.beforePhotos,
                after: completionPhotos.afterPhotos,
                resolution: resolutionPhotos,
                all: [
                  ...issuePhotos,
                  ...completionPhotos.beforePhotos,
                  ...completionPhotos.afterPhotos,
                  ...resolutionPhotos,
                ].filter((photo, index, all) => all.indexOf(photo) === index),
              },
              partsUsed: partsDetailed,
              labor: {
                hours: Number(laborHours.toFixed(2)),
                ratePerHour: DEFAULT_LABOR_RATE_PER_HOUR,
                cost: Number(laborCost.toFixed(2)),
              },
              claimAmount: {
                partsCost: Number(partsCost.toFixed(2)),
                laborCost: Number(laborCost.toFixed(2)),
                total: totalClaimAmount,
                currency: "INR",
              },
              timeline: {
                workflow: workflowTimestamps,
                events: timelineEvents,
              },
              links: {
                claimReportPath: reportPath,
                claimReportUrl: reportUrl,
                nfcPath,
                nfcUrl,
              },
              gpsLocation: hasGpsLocation
                ? {
                    latitude: Number(gpsLocation.latitude.toFixed(6)),
                    longitude: Number(gpsLocation.longitude.toFixed(6)),
                  }
                : null,
            };

            try {
              const createdClaim = await tx.warrantyClaim.create({
                data: {
                  id: claimId,
                  claimNumber,
                  ticketId: ticket.id,
                  productId: ticket.productId,
                  manufacturerOrgId: ticket.product.organizationId,
                  serviceCenterOrgId,
                  claimType: "warranty_repair",
                  partsCost: Number(partsCost.toFixed(2)),
                  laborCost: Number(laborCost.toFixed(2)),
                  totalClaimAmount,
                  documentation: documentationPayload,
                  documentationPdfUrl: reportPath,
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

              break;
            } catch (error) {
              if (
                isClaimNumberUniqueCollision(error) &&
                attempt < MAX_CLAIM_NUMBER_ATTEMPTS - 1
              ) {
                continue;
              }

              if (isClaimNumberUniqueCollision(error)) {
                throw new ClaimNumberCollisionError();
              }

              throw error;
            }
          }

          if (!generatedClaim) {
            throw new ClaimNumberCollisionError();
          }
        }

        return {
          updatedTicket,
          generatedClaim,
        };
      });

      await stopTrackingForTicket({
        ticketId: ticket.id,
        reason: "ticket_resolved",
        actorRole: "customer",
        ticketMetadata: ticket.metadata,
        productInstallationLocation: ticket.product.installationLocation,
      });

      if (ticket.assignedTechnician?.phone) {
        void sendTechnicianResolutionConfirmedNotification({
          technicianPhone: ticket.assignedTechnician.phone,
          ticketNumber: ticket.ticketNumber,
        });
      }

      void writeScanLog({
        stickerNumber: ticket.product.sticker.stickerNumber,
        productId: ticket.productId,
        viewerType:
          ownerAccess.via === "clerk" ? "owner_verified" : "owner_session",
        userId: ownerAccess.userId,
        actionTaken: "confirmed_resolution",
        userAgent: request.headers.get("user-agent"),
        ipAddress:
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip"),
      });

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
            comment ?? "Customer marked issue as unresolved after repair.",
        },
      }),
      prisma.ticketTimeline.create({
        data: {
          ticketId: id,
          eventType: "reopened",
          eventDescription:
            comment ?? "Customer reported issue not resolved.",
          actorUserId: ownerAccess.userId,
          actorRole: "customer",
          actorName: "Customer",
        },
      }),
    ]);

    await stopTrackingForTicket({
      ticketId: reopenedTicket.id,
      reason: "ticket_reopened",
      actorRole: "customer",
      ticketMetadata: ticket.metadata,
      productInstallationLocation: ticket.product.installationLocation,
    });

    await runSlaSweep({ ticketId: reopenedTicket.id });

    return NextResponse.json({
      success: true,
      message: `Ticket ${ticket.ticketNumber} has been reopened.`,
      ticket: reopenedTicket,
    });
  } catch (error) {
    if (error instanceof ClaimNumberCollisionError) {
      return NextResponse.json(
        {
          error:
            "Claim number allocation conflicted. Please retry confirmation.",
        },
        { status: 503 },
      );
    }

    console.error("Ticket confirmation failed", error);
    return NextResponse.json(
      { error: "Unable to update ticket status." },
      { status: 500 },
    );
  }
}

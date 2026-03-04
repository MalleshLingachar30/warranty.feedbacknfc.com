import { type Prisma, type TicketStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { resolveTechnicianId } from "@/lib/technician-context";

export const runtime = "nodejs";

const COMPLETED_STATUSES: TicketStatus[] = [
  "pending_confirmation",
  "resolved",
  "closed",
];

const VISIBLE_JOB_STATUSES: TicketStatus[] = [
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "resolved",
  "closed",
  "reopened",
  "escalated",
];

const DEFAULT_LABOR_RATE_PER_HOUR = 550;

type PartCatalogItem = {
  id: string;
  name: string;
  partNumber: string;
  typicalCost: number;
};

type PartUsed = {
  partName: string;
  partNumber: string;
  cost: number;
  quantity: number;
};

type JobServiceHistoryItem = {
  id: string;
  ticketNumber: string;
  issueCategory: string;
  status: TicketStatus;
  reportedAt: string;
  resolutionNotes: string | null;
};

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

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePartCatalog(value: Prisma.JsonValue): PartCatalogItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const id =
        asNonEmptyString(candidate.id) ??
        `part-${Math.random().toString(16).slice(2, 8)}`;
      const name = asNonEmptyString(candidate.name);

      if (!name) {
        return null;
      }

      return {
        id,
        name,
        partNumber: asNonEmptyString(candidate.partNumber) ?? "",
        typicalCost: toNumber(candidate.typicalCost, 0),
      } satisfies PartCatalogItem;
    })
    .filter((entry): entry is PartCatalogItem => Boolean(entry));
}

function parsePartsUsed(value: Prisma.JsonValue): PartUsed[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const partName = asNonEmptyString(candidate.partName);

      if (!partName) {
        return null;
      }

      return {
        partName,
        partNumber: asNonEmptyString(candidate.partNumber) ?? "",
        cost: toNumber(candidate.cost, 0),
        quantity: Math.max(1, Math.floor(toNumber(candidate.quantity, 1))),
      } satisfies PartUsed;
    })
    .filter((entry): entry is PartUsed => Boolean(entry));
}

function sanitizeStringArray(values: string[]): string[] {
  return values
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function scorePartMatch(part: PartCatalogItem, keywords: string[]): number {
  if (keywords.length === 0) {
    return 0;
  }

  const searchable = `${part.name} ${part.partNumber}`.toLowerCase();
  return keywords.reduce((score, keyword) => {
    return searchable.includes(keyword) ? score + 1 : score;
  }, 0);
}

function suggestParts(
  issueCategory: string,
  issueDescription: string,
  catalog: PartCatalogItem[],
): PartCatalogItem[] {
  if (catalog.length === 0) {
    return [];
  }

  const keywords = Array.from(
    new Set(
      `${issueCategory} ${issueDescription}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3),
    ),
  );

  const ranked = catalog
    .map((part) => ({
      part,
      score: scorePartMatch(part, keywords),
    }))
    .sort((left, right) => right.score - left.score);

  const withSignal = ranked
    .filter((entry) => entry.score > 0)
    .map((entry) => entry.part);
  if (withSignal.length > 0) {
    return withSignal.slice(0, 3);
  }

  return catalog.slice(0, 3);
}

function computeClaimValueFromTicket(ticket: {
  claim: { totalClaimAmount: unknown } | null;
  claimById: { totalClaimAmount: unknown } | null;
  partsUsed: PartUsed[];
  laborHours: unknown;
}): number {
  const claimTotal = toNumber(
    ticket.claim?.totalClaimAmount ?? ticket.claimById?.totalClaimAmount,
    Number.NaN,
  );

  if (Number.isFinite(claimTotal) && claimTotal > 0) {
    return claimTotal;
  }

  const partsCost = ticket.partsUsed.reduce(
    (sum, part) => sum + part.cost * part.quantity,
    0,
  );
  const laborHours = toNumber(ticket.laborHours, 0);

  return partsCost + laborHours * DEFAULT_LABOR_RATE_PER_HOUR;
}

function averageResolutionHours(
  rows: Array<{
    technicianStartedAt: Date | null;
    technicianCompletedAt: Date | null;
  }>,
): number {
  const durations = rows
    .filter((row) => row.technicianStartedAt && row.technicianCompletedAt)
    .map((row) => {
      return (
        (row.technicianCompletedAt!.getTime() -
          row.technicianStartedAt!.getTime()) /
        (1000 * 60 * 60)
      );
    })
    .filter((duration) => Number.isFinite(duration) && duration >= 0);

  if (durations.length === 0) {
    return 0;
  }

  const sum = durations.reduce((acc, value) => acc + value, 0);
  return Number((sum / durations.length).toFixed(2));
}

export async function GET(request: NextRequest) {
  try {
    const requestedTechnicianId = resolveTechnicianId(request);

    const technician =
      (requestedTechnicianId
        ? await db.technician.findFirst({
            where: {
              OR: [
                { id: requestedTechnicianId },
                { userId: requestedTechnicianId },
                {
                  user: {
                    clerkId: requestedTechnicianId,
                  },
                },
              ],
            },
            include: {
              serviceCenter: {
                select: {
                  name: true,
                },
              },
            },
          })
        : null) ??
      (await db.technician.findFirst({
        include: {
          serviceCenter: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ isAvailable: "desc" }, { createdAt: "asc" }],
      }));

    if (!technician) {
      return NextResponse.json(
        { error: "No technician profile found." },
        { status: 404 },
      );
    }

    const tickets = await db.ticket.findMany({
      where: {
        assignedTechnicianId: technician.id,
        status: {
          in: VISIBLE_JOB_STATUSES,
        },
      },
      orderBy: [{ reportedAt: "desc" }],
      include: {
        product: {
          select: {
            id: true,
            serialNumber: true,
            customerName: true,
            customerPhone: true,
            customerAddress: true,
            customerCity: true,
            customerPincode: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
                partsCatalog: true,
              },
            },
          },
        },
        claim: {
          select: {
            totalClaimAmount: true,
          },
        },
        claimById: {
          select: {
            totalClaimAmount: true,
          },
        },
      },
    });

    const productIds = Array.from(
      new Set(tickets.map((ticket) => ticket.productId)),
    );

    const historyRows = productIds.length
      ? await db.ticket.findMany({
          where: {
            productId: {
              in: productIds,
            },
          },
          orderBy: [{ reportedAt: "desc" }],
          select: {
            id: true,
            productId: true,
            ticketNumber: true,
            issueCategory: true,
            status: true,
            reportedAt: true,
            resolutionNotes: true,
          },
        })
      : [];

    const historyByProductId = historyRows.reduce((accumulator, row) => {
      const historyItem: JobServiceHistoryItem = {
        id: row.id,
        ticketNumber: row.ticketNumber,
        issueCategory: row.issueCategory ?? "General issue",
        status: row.status,
        reportedAt: row.reportedAt.toISOString(),
        resolutionNotes: row.resolutionNotes,
      };

      const existing = accumulator.get(row.productId) ?? [];
      existing.push(historyItem);
      accumulator.set(row.productId, existing);
      return accumulator;
    }, new Map<string, JobServiceHistoryItem[]>());

    const jobs = tickets.map((ticket) => {
      const partsCatalog = parsePartCatalog(
        ticket.product.productModel.partsCatalog,
      );
      const partsUsed = parsePartsUsed(ticket.partsUsed);
      const claimValue = computeClaimValueFromTicket({
        claim: ticket.claim,
        claimById: ticket.claimById,
        partsUsed,
        laborHours: ticket.laborHours,
      });

      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        severity: ticket.issueSeverity,
        issueCategory: ticket.issueCategory ?? "General issue",
        issueDescription: ticket.issueDescription,
        reportedAt: ticket.reportedAt.toISOString(),
        customerName:
          ticket.product.customerName ?? ticket.reportedByName ?? "Customer",
        customerPhone: ticket.product.customerPhone ?? ticket.reportedByPhone,
        customerAddress:
          ticket.product.customerAddress ?? "Address unavailable",
        customerCity: ticket.product.customerCity ?? "Unknown city",
        customerPincode: ticket.product.customerPincode ?? "",
        productName: ticket.product.productModel.name,
        productModelNumber: ticket.product.productModel.modelNumber ?? "",
        productSerialNumber: ticket.product.serialNumber ?? "",
        customerPhotos: sanitizeStringArray(ticket.issuePhotos),
        resolutionPhotos: sanitizeStringArray(ticket.resolutionPhotos),
        resolutionNotes: ticket.resolutionNotes,
        partsUsed,
        partsCatalog,
        aiSuggestedParts: suggestParts(
          ticket.issueCategory ?? "",
          ticket.issueDescription,
          partsCatalog,
        ),
        serviceHistory: historyByProductId.get(ticket.productId) ?? [],
        technicianStartedAt: ticket.technicianStartedAt?.toISOString() ?? null,
        technicianCompletedAt:
          ticket.technicianCompletedAt?.toISOString() ?? null,
        laborHours: ticket.laborHours ? toNumber(ticket.laborHours, 0) : null,
        claimValue: Number(claimValue.toFixed(2)),
      };
    });

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const completedTickets = tickets.filter((ticket) =>
      COMPLETED_STATUSES.includes(ticket.status),
    );

    const jobsCompletedThisWeek = completedTickets.filter((ticket) => {
      return Boolean(
        ticket.technicianCompletedAt &&
        ticket.technicianCompletedAt >= weekStart,
      );
    }).length;

    const jobsCompletedThisMonth = completedTickets.filter((ticket) => {
      return Boolean(
        ticket.technicianCompletedAt &&
        ticket.technicianCompletedAt >= monthStart,
      );
    }).length;

    const totalClaimsValueGenerated = jobs.reduce(
      (sum, job) =>
        sum + (COMPLETED_STATUSES.includes(job.status) ? job.claimValue : 0),
      0,
    );

    const payload = {
      technician: {
        id: technician.id,
        name: technician.name,
        phone: technician.phone,
        serviceCenterName: technician.serviceCenter.name,
      },
      jobs,
      performance: {
        jobsCompletedThisWeek,
        jobsCompletedThisMonth,
        averageResolutionTimeHours: averageResolutionHours(tickets),
        customerRating: Number(toNumber(technician.rating, 0).toFixed(1)),
        totalClaimsValueGenerated: Number(totalClaimsValueGenerated.toFixed(2)),
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load technician jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

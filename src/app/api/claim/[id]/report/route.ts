import { type Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { db } from "@/lib/db";
import { createClaimReportPdfDocument } from "@/lib/pdf/claim-report-document";

export const runtime = "nodejs";

type GenericRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "toNumber" in value) {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch {
      return fallback;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function parsePartsDetailed(value: unknown): Array<{
  partName: string;
  partNumber: string;
  quantity: number;
  cost: number;
  lineTotal: number;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as GenericRecord;
      const partName = asString(record.partName) ?? asString(record.name);
      if (!partName) {
        return null;
      }

      const partNumber = asString(record.partNumber) ?? "";
      const quantity = Math.max(1, Math.floor(toNumber(record.quantity, 1)));
      const cost = Math.max(0, toNumber(record.cost, 0));

      return {
        partName,
        partNumber,
        quantity,
        cost,
        lineTotal: Number((quantity * cost).toFixed(2)),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        partName: string;
        partNumber: string;
        quantity: number;
        cost: number;
        lineTotal: number;
      } => Boolean(entry),
    );
}

function parseTimelineRows(value: unknown): Array<{ label: string; at: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as GenericRecord;
      const label = asString(record.label);
      const at = asString(record.at);

      if (!label || !at) {
        return null;
      }

      return { label, at };
    })
    .filter((entry): entry is { label: string; at: string } => Boolean(entry));
}

function toClaimWhereByRole(
  role: string,
  organizationId: string | null,
  claimId: string,
): Prisma.WarrantyClaimWhereInput {
  if (role === "manufacturer_admin") {
    return {
      id: claimId,
      manufacturerOrgId: organizationId ?? "__missing_org__",
    };
  }

  if (role === "service_center_admin") {
    return {
      id: claimId,
      serviceCenterOrgId: organizationId ?? "__missing_org__",
    };
  }

  return {
    id: claimId,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authData = await auth();

  if (!authData.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return new Response("Claim id is required.", { status: 400 });
  }

  const dbUser = await db.user.findUnique({
    where: { clerkId: authData.userId },
    select: {
      role: true,
      organizationId: true,
    },
  });

  if (!dbUser) {
    return new Response("User record not found.", { status: 404 });
  }

  if (
    dbUser.role !== "super_admin" &&
    dbUser.role !== "manufacturer_admin" &&
    dbUser.role !== "service_center_admin"
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const claim = await db.warrantyClaim.findFirst({
    where: toClaimWhereByRole(dbUser.role, dbUser.organizationId, id),
    select: {
      id: true,
      claimNumber: true,
      partsCost: true,
      laborCost: true,
      totalClaimAmount: true,
      createdAt: true,
      documentation: true,
      ticket: {
        select: {
          ticketNumber: true,
          issueCategory: true,
          issueDescription: true,
          issuePhotos: true,
          resolutionPhotos: true,
          resolutionNotes: true,
          reportedAt: true,
          assignedAt: true,
          technicianStartedAt: true,
          technicianCompletedAt: true,
          customerConfirmedAt: true,
          closedAt: true,
          laborHours: true,
          partsUsed: true,
          assignedTechnician: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      },
      product: {
        select: {
          serialNumber: true,
          customerName: true,
          customerPhone: true,
          customerAddress: true,
          productModel: {
            select: {
              name: true,
              modelNumber: true,
            },
          },
        },
      },
      manufacturerOrg: {
        select: {
          name: true,
        },
      },
      serviceCenterOrg: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!claim) {
    return new Response("Claim not found.", { status: 404 });
  }

  const documentation = asRecord(claim.documentation);
  const documentationParts = parsePartsDetailed(documentation.partsUsed);
  const fallbackParts = parsePartsDetailed(claim.ticket.partsUsed);
  const parts = documentationParts.length > 0 ? documentationParts : fallbackParts;

  const docsPhotosRecord = asRecord(documentation.photos);
  const photos = [
    ...asStringArray(docsPhotosRecord.issue),
    ...asStringArray(docsPhotosRecord.before),
    ...asStringArray(docsPhotosRecord.after),
    ...asStringArray(documentation.photos),
    ...claim.ticket.issuePhotos,
    ...claim.ticket.resolutionPhotos,
  ].filter((entry, index, all) => all.indexOf(entry) === index);

  const docsTimeline = parseTimelineRows(asRecord(documentation.timeline).workflow);
  const timelineFallback = [
    { label: "Reported", at: formatDateTime(claim.ticket.reportedAt) },
    claim.ticket.assignedAt
      ? { label: "Assigned", at: formatDateTime(claim.ticket.assignedAt) }
      : null,
    claim.ticket.technicianStartedAt
      ? {
          label: "Work Started",
          at: formatDateTime(claim.ticket.technicianStartedAt),
        }
      : null,
    claim.ticket.technicianCompletedAt
      ? {
          label: "Work Completed",
          at: formatDateTime(claim.ticket.technicianCompletedAt),
        }
      : null,
    claim.ticket.customerConfirmedAt
      ? {
          label: "Customer Confirmed",
          at: formatDateTime(claim.ticket.customerConfirmedAt),
        }
      : null,
    claim.ticket.closedAt
      ? { label: "Closed", at: formatDateTime(claim.ticket.closedAt) }
      : null,
  ].filter((entry): entry is { label: string; at: string } => Boolean(entry));

  const timeline = docsTimeline.length > 0 ? docsTimeline : timelineFallback;

  const laborHours =
    toNumber(asRecord(documentation.labor).hours, toNumber(claim.ticket.laborHours));
  const laborCost = toNumber(claim.laborCost);
  const partsCost = toNumber(claim.partsCost);
  const totalClaimAmount = toNumber(claim.totalClaimAmount);
  const technicianName =
    asString(asRecord(documentation.technician).name) ??
    claim.ticket.assignedTechnician?.name ??
    null;
  const technicianPhone =
    asString(asRecord(documentation.technician).phone) ??
    claim.ticket.assignedTechnician?.phone ??
    null;
  const technicianNotes =
    asString(asRecord(documentation.notes).technicianResolution) ??
    claim.ticket.resolutionNotes ??
    null;

  const documentElement = createClaimReportPdfDocument({
    claimNumber: claim.claimNumber,
    ticketNumber: claim.ticket.ticketNumber,
    manufacturerName: claim.manufacturerOrg.name,
    serviceCenterName: claim.serviceCenterOrg.name,
    productName: claim.product.productModel.name,
    modelNumber: claim.product.productModel.modelNumber,
    serialNumber: claim.product.serialNumber,
    customerName: claim.product.customerName ?? "Customer",
    customerPhone: claim.product.customerPhone ?? "-",
    customerAddress: claim.product.customerAddress,
    issueCategory: claim.ticket.issueCategory,
    issueDescription: claim.ticket.issueDescription,
    technicianName,
    technicianPhone,
    technicianNotes,
    parts,
    laborHours,
    laborCost,
    partsCost,
    totalClaimAmount,
    timestamps: timeline,
    photoUrls: photos,
    generatedAt: formatDateTime(claim.createdAt),
  });

  const pdfBuffer = await renderToBuffer(
    documentElement,
  );

  const url = new URL(request.url);
  const asAttachment =
    url.searchParams.get("download") === "1" ||
    url.searchParams.get("download") === "true";
  const dispositionType = asAttachment ? "attachment" : "inline";

  const responseBody = Uint8Array.from(pdfBuffer).buffer;

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dispositionType}; filename=\"${claim.claimNumber}-report.pdf\"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

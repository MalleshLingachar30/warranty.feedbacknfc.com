import { Prisma } from "@prisma/client";

import type {
  ClaimDocumentationView,
  ClaimQueueRow,
} from "@/components/manufacturer/types";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }

      if (isRecord(entry) && typeof entry.url === "string") {
        return entry.url.trim();
      }

      if (isRecord(entry) && typeof entry.name === "string") {
        return entry.name.trim();
      }

      return "";
    })
    .filter((entry) => entry.length > 0);
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asString(value: unknown, fallback = ""): string {
  return asNullableString(value) ?? fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asTimeline(value: unknown): Array<{ label: string; at: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const label = asNullableString(entry.label);
      const at = asNullableString(entry.at);

      if (!label || !at) {
        return null;
      }

      return {
        label,
        at,
      };
    })
    .filter((entry): entry is { label: string; at: string } => Boolean(entry));
}

function asPartsDetailed(value: unknown): Array<{
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
      if (!isRecord(entry)) {
        return null;
      }

      const partName =
        asNullableString(entry.partName) ?? asNullableString(entry.name);

      if (!partName) {
        return null;
      }

      const quantity = Math.max(1, Math.floor(asNumber(entry.quantity, 1)));
      const cost = Math.max(0, asNumber(entry.cost, 0));

      return {
        partName,
        partNumber: asString(entry.partNumber),
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

function normalizeParts(partsUsed: unknown): string[] {
  if (!Array.isArray(partsUsed)) {
    return [];
  }

  return partsUsed
    .map((part) => {
      if (typeof part === "string") {
        return part.trim();
      }

      if (isRecord(part)) {
        if (typeof part.name === "string") {
          return part.name.trim();
        }

        if (typeof part.partName === "string") {
          return part.partName.trim();
        }
      }

      return "";
    })
    .filter((entry) => entry.length > 0);
}

export function decimalToNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      const numeric = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(numeric) ? numeric : 0;
    } catch {
      return 0;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const manufacturerClaimSummarySelect =
  Prisma.validator<Prisma.WarrantyClaimSelect>()({
    id: true,
    claimNumber: true,
    totalClaimAmount: true,
    approvedAmount: true,
    status: true,
    submittedAt: true,
    createdAt: true,
    rejectionReason: true,
    ticket: {
      select: {
        ticketNumber: true,
      },
    },
    product: {
      select: {
        serialNumber: true,
        productModel: {
          select: {
            name: true,
            modelNumber: true,
          },
        },
      },
    },
    serviceCenterOrg: {
      select: {
        name: true,
      },
    },
  });

export const manufacturerClaimDetailSelect =
  Prisma.validator<Prisma.WarrantyClaimSelect>()({
    id: true,
    documentation: true,
    documentationPdfUrl: true,
    partsCost: true,
    laborCost: true,
    totalClaimAmount: true,
    ticket: {
      select: {
        issueCategory: true,
        issueDescription: true,
        issueSeverity: true,
        issuePhotos: true,
        resolutionPhotos: true,
        partsUsed: true,
        laborHours: true,
        reportedByName: true,
        reportedByPhone: true,
        resolutionNotes: true,
        reportedAt: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
        customerConfirmedAt: true,
        closedAt: true,
      },
    },
    product: {
      select: {
        serialNumber: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        customerAddress: true,
        customerCity: true,
        customerState: true,
        customerPincode: true,
        warrantyStartDate: true,
        warrantyEndDate: true,
        productModel: {
          select: {
            name: true,
            modelNumber: true,
          },
        },
      },
    },
  });

export type ManufacturerClaimSummaryRecord = Prisma.WarrantyClaimGetPayload<{
  select: typeof manufacturerClaimSummarySelect;
}>;

export type ManufacturerClaimDetailRecord = Prisma.WarrantyClaimGetPayload<{
  select: typeof manufacturerClaimDetailSelect;
}>;

export function mapClaimSummary(
  claim: ManufacturerClaimSummaryRecord,
): ClaimQueueRow {
  const productLabel = [
    claim.product.productModel.name,
    claim.product.productModel.modelNumber
      ? `(${claim.product.productModel.modelNumber})`
      : null,
    claim.product.serialNumber ? `• ${claim.product.serialNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    ticketReference: claim.ticket.ticketNumber,
    product: productLabel,
    serviceCenter: claim.serviceCenterOrg.name,
    amount: decimalToNumber(claim.totalClaimAmount),
    approvedAmount:
      claim.approvedAmount === null
        ? null
        : decimalToNumber(claim.approvedAmount),
    status: claim.status,
    submittedDate: (claim.submittedAt ?? claim.createdAt).toISOString(),
    documentation: null,
    rejectionReason: claim.rejectionReason,
    isDemo: false,
  };
}

export function mapClaimDocumentation(
  claim: ManufacturerClaimDetailRecord,
): ClaimDocumentationView {
  const documentationRecord = isRecord(claim.documentation)
    ? claim.documentation
    : {};

  const photosRecord = isRecord(documentationRecord.photos)
    ? documentationRecord.photos
    : {};
  const timelineRecord = isRecord(documentationRecord.timeline)
    ? documentationRecord.timeline
    : {};
  const claimAmountRecord = isRecord(documentationRecord.claimAmount)
    ? documentationRecord.claimAmount
    : {};
  const laborRecord = isRecord(documentationRecord.labor)
    ? documentationRecord.labor
    : {};
  const customerRecord = isRecord(documentationRecord.customer)
    ? documentationRecord.customer
    : {};
  const productRecord = isRecord(documentationRecord.product)
    ? documentationRecord.product
    : {};
  const notesRecord = isRecord(documentationRecord.notes)
    ? documentationRecord.notes
    : {};

  const documentationPhotos = [
    ...asStringArray(photosRecord.issue),
    ...asStringArray(photosRecord.before),
    ...asStringArray(photosRecord.after),
    ...asStringArray(photosRecord.resolution),
    ...asStringArray(photosRecord.all),
    ...asStringArray(documentationRecord.photos),
  ].filter((entry, index, all) => all.indexOf(entry) === index);
  const beforePhotos = asStringArray(photosRecord.before);
  const afterPhotos = asStringArray(photosRecord.after);
  const documentedTimestamps = asStringArray(documentationRecord.timestamps);
  const documentedTimeline = asTimeline(timelineRecord.workflow);
  const documentedParts = asStringArray(documentationRecord.partsUsed);
  const documentedPartsDetailed = asPartsDetailed(
    documentationRecord.partsUsed,
  );
  const documentedNotes =
    asNullableString(notesRecord.technicianResolution) ??
    asNullableString(documentationRecord.technicianNotes) ??
    "";

  const fallbackPhotos = [
    ...claim.ticket.issuePhotos,
    ...claim.ticket.resolutionPhotos,
  ].filter((photo) => typeof photo === "string" && photo.trim().length > 0);

  const fallbackTimestamps = [
    claim.ticket.reportedAt,
    claim.ticket.technicianStartedAt,
    claim.ticket.technicianCompletedAt,
    claim.ticket.customerConfirmedAt,
    claim.ticket.closedAt,
  ]
    .filter((value): value is Date => value instanceof Date)
    .map((date) => date.toISOString());

  return {
    photos:
      documentationPhotos.length > 0 ? documentationPhotos : fallbackPhotos,
    beforePhotos,
    afterPhotos,
    timestamps:
      documentedTimestamps.length > 0
        ? documentedTimestamps
        : fallbackTimestamps,
    timeline:
      documentedTimeline.length > 0
        ? documentedTimeline
        : fallbackTimestamps.map((timestamp) => ({
            label: "Timeline Event",
            at: timestamp,
          })),
    partsUsed:
      documentedParts.length > 0
        ? documentedParts
        : normalizeParts(claim.ticket.partsUsed),
    partsDetailed:
      documentedPartsDetailed.length > 0
        ? documentedPartsDetailed
        : asPartsDetailed(claim.ticket.partsUsed),
    technicianNotes:
      documentedNotes.length > 0
        ? documentedNotes
        : (claim.ticket.resolutionNotes ?? "No notes submitted."),
    issueCategory: claim.ticket.issueCategory ?? "General issue",
    issueDescription: claim.ticket.issueDescription,
    issueSeverity: claim.ticket.issueSeverity,
    customer: {
      name:
        asNullableString(customerRecord.name) ??
        claim.product.customerName ??
        claim.ticket.reportedByName ??
        "Customer",
      phone:
        asNullableString(customerRecord.phone) ??
        claim.product.customerPhone ??
        claim.ticket.reportedByPhone ??
        "-",
      email:
        asNullableString(customerRecord.email) ?? claim.product.customerEmail,
      address:
        asNullableString(customerRecord.address) ??
        claim.product.customerAddress,
      city: asNullableString(customerRecord.city) ?? claim.product.customerCity,
      state:
        asNullableString(customerRecord.state) ?? claim.product.customerState,
      pincode:
        asNullableString(customerRecord.pincode) ??
        claim.product.customerPincode,
    },
    product: {
      name: claim.product.productModel.name,
      modelNumber:
        asNullableString(productRecord.modelNumber) ??
        claim.product.productModel.modelNumber,
      serialNumber:
        asNullableString(productRecord.serialNumber) ??
        claim.product.serialNumber,
      warrantyStartDate: claim.product.warrantyStartDate
        ? claim.product.warrantyStartDate.toISOString()
        : null,
      warrantyEndDate: claim.product.warrantyEndDate
        ? claim.product.warrantyEndDate.toISOString()
        : null,
    },
    costBreakdown: {
      partsCost: decimalToNumber(claim.partsCost),
      laborCost: decimalToNumber(claim.laborCost),
      laborHours: decimalToNumber(
        laborRecord.hours ??
          claimAmountRecord.laborHours ??
          claim.ticket.laborHours,
      ),
      totalClaimAmount: decimalToNumber(claim.totalClaimAmount),
      currency: asString(claimAmountRecord.currency, "INR"),
    },
    gpsLocation: asNullableString(documentationRecord.gpsLocation),
    claimReportUrl: claim.documentationPdfUrl,
  };
}

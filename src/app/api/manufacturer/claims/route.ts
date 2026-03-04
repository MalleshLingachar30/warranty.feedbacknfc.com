import { NextResponse } from "next/server";
import { ClaimStatus } from "@prisma/client";

import { db } from "@/lib/db";

import {
  PENDING_REVIEW_CLAIM_STATUSES,
  jsonError,
  requireManufacturerContext,
} from "../_utils";

type ClaimDocumentation = {
  photos: string[];
  timestamps: string[];
  partsUsed: string[];
  technicianNotes: string;
};

type ClaimQueueRow = {
  id: string;
  claimNumber: string;
  ticketReference: string;
  product: string;
  serviceCenter: string;
  amount: number;
  approvedAmount: number | null;
  status: ClaimStatus;
  submittedDate: string;
  documentation: ClaimDocumentation;
  rejectionReason: string | null;
};

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
    .filter((value) => value.length > 0);
}

function toNumberValue(value: unknown) {
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

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();

    const claims = await db.warrantyClaim.findMany({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          in: [
            ...PENDING_REVIEW_CLAIM_STATUSES,
            "approved",
            "rejected",
            "paid",
            "disputed",
            "closed",
          ],
        },
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        claimNumber: true,
        totalClaimAmount: true,
        approvedAmount: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        documentation: true,
        rejectionReason: true,
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            issuePhotos: true,
            resolutionPhotos: true,
            partsUsed: true,
            resolutionNotes: true,
            reportedAt: true,
            technicianStartedAt: true,
            technicianCompletedAt: true,
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
      },
    });

    const queue: ClaimQueueRow[] = claims.map((claim) => {
      const documentationRecord = isRecord(claim.documentation)
        ? claim.documentation
        : {};

      const documentationPhotos = asStringArray(documentationRecord.photos);
      const documentedTimestamps = asStringArray(
        documentationRecord.timestamps,
      );
      const documentedParts = asStringArray(documentationRecord.partsUsed);
      const documentedNotes =
        typeof documentationRecord.technicianNotes === "string"
          ? documentationRecord.technicianNotes.trim()
          : "";

      const fallbackPhotos = [
        ...claim.ticket.issuePhotos,
        ...claim.ticket.resolutionPhotos,
      ].filter((photo) => typeof photo === "string" && photo.trim().length > 0);

      const fallbackTimestamps = [
        claim.ticket.reportedAt,
        claim.ticket.technicianStartedAt,
        claim.ticket.technicianCompletedAt,
      ]
        .filter((value): value is Date => value instanceof Date)
        .map((date) => date.toISOString());

      const fallbackParts = normalizeParts(claim.ticket.partsUsed);

      const productName = claim.product.productModel.name;
      const modelNumber = claim.product.productModel.modelNumber;
      const serialNumber = claim.product.serialNumber;

      const productLabel = [
        productName,
        modelNumber ? `(${modelNumber})` : null,
        serialNumber ? `• ${serialNumber}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        id: claim.id,
        claimNumber: claim.claimNumber,
        ticketReference: claim.ticket.ticketNumber,
        product: productLabel,
        serviceCenter: claim.serviceCenterOrg.name,
        amount: toNumberValue(claim.totalClaimAmount),
        approvedAmount:
          claim.approvedAmount === null
            ? null
            : toNumberValue(claim.approvedAmount),
        status: claim.status,
        submittedDate: (claim.submittedAt ?? claim.createdAt).toISOString(),
        rejectionReason: claim.rejectionReason,
        documentation: {
          photos:
            documentationPhotos.length > 0
              ? documentationPhotos
              : fallbackPhotos,
          timestamps:
            documentedTimestamps.length > 0
              ? documentedTimestamps
              : fallbackTimestamps,
          partsUsed:
            documentedParts.length > 0 ? documentedParts : fallbackParts,
          technicianNotes:
            documentedNotes.length > 0
              ? documentedNotes
              : (claim.ticket.resolutionNotes ?? "No notes submitted."),
        },
      };
    });

    return NextResponse.json({ claims: queue });
  } catch (error) {
    return jsonError(error);
  }
}

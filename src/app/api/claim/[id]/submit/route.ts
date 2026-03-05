import { type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sendManufacturerClaimSubmittedEmail } from "@/lib/warranty-notifications";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "../../../service-center/_utils";

interface SubmitClaimPartInput {
  partName?: string;
  partNumber?: string;
  cost?: number;
  quantity?: number;
}

interface SubmitClaimPayload {
  notes?: unknown;
  laborHours?: unknown;
  partsUsed?: unknown;
}

type GenericRecord = Record<string, unknown>;

const DEFAULT_LABOR_RATE_PER_HOUR = 550;

function asRecord(value: unknown): GenericRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as GenericRecord;
}

function asString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function toNumber(value: unknown, fallback = 0): number {
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

function normalizeParts(value: unknown): Array<{
  partName: string;
  partNumber: string;
  cost: number;
  quantity: number;
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

      const candidate = entry as SubmitClaimPartInput;
      const partName = asString(candidate.partName);

      if (!partName) {
        return null;
      }

      const partNumber = asString(candidate.partNumber);
      const quantity = Math.max(1, Math.floor(toNumber(candidate.quantity, 1)));
      const cost = Math.max(0, toNumber(candidate.cost, 0));

      return {
        partName,
        partNumber,
        quantity,
        cost: Number(cost.toFixed(2)),
        lineTotal: Number((cost * quantity).toFixed(2)),
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
        lineTotal: number;
      } => Boolean(entry),
    );
}

function parseExistingParts(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{
      partName: string;
      partNumber: string;
      cost: number;
      quantity: number;
      lineTotal: number;
    }>;
  }

  return normalizeParts(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId, dbUserId } = await requireServiceCenterContext();
    const { id } = await params;

    if (!id) {
      throw new ApiError("Claim id is required.", 400);
    }

    const body = parseJsonBody<SubmitClaimPayload>(await request.json());

    const claim = await db.warrantyClaim.findFirst({
      where: {
        id,
        serviceCenterOrgId: organizationId,
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        documentation: true,
        partsCost: true,
        laborCost: true,
        totalClaimAmount: true,
        ticket: {
          select: {
            ticketNumber: true,
            laborHours: true,
            partsUsed: true,
          },
        },
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

    if (!claim) {
      throw new ApiError("Claim not found.", 404);
    }

    if (claim.status !== "auto_generated") {
      throw new ApiError(
        "Only auto-generated claims can be submitted for manufacturer review.",
        409,
      );
    }

    const documentation = asRecord(claim.documentation);
    const inputParts = normalizeParts(body.partsUsed);
    const existingParts = parseExistingParts(documentation.partsUsed);
    const fallbackParts = parseExistingParts(claim.ticket.partsUsed);
    const finalParts =
      inputParts.length > 0
        ? inputParts
        : existingParts.length > 0
          ? existingParts
          : fallbackParts;

    const partsCost = finalParts.reduce((sum, part) => sum + part.lineTotal, 0);
    const fallbackLaborHours = toNumber(
      asRecord(documentation.labor).hours,
      toNumber(claim.ticket.laborHours, 0),
    );
    const laborHours = Math.max(0, toNumber(body.laborHours, fallbackLaborHours));
    const laborCost = laborHours * DEFAULT_LABOR_RATE_PER_HOUR;
    const totalClaimAmount = Number((partsCost + laborCost).toFixed(2));
    const now = new Date();
    const notes = asString(body.notes);

    const existingTimeline = asRecord(documentation.timeline);
    const workflow = Array.isArray(existingTimeline.workflow)
      ? [...existingTimeline.workflow]
      : [];
    workflow.push({
      label: "Submitted to Manufacturer",
      at: now.toISOString(),
      atLabel: now.toLocaleString("en-IN"),
    });

    const updatedDocumentation: Prisma.InputJsonValue = {
      ...documentation,
      partsUsed: finalParts,
      labor: {
        ...asRecord(documentation.labor),
        hours: Number(laborHours.toFixed(2)),
        ratePerHour: DEFAULT_LABOR_RATE_PER_HOUR,
        cost: Number(laborCost.toFixed(2)),
      },
      claimAmount: {
        ...asRecord(documentation.claimAmount),
        partsCost: Number(partsCost.toFixed(2)),
        laborCost: Number(laborCost.toFixed(2)),
        total: totalClaimAmount,
        currency:
          asString(asRecord(documentation.claimAmount).currency) || "INR",
      },
      timeline: {
        ...existingTimeline,
        workflow,
      },
      serviceCenterReview: {
        reviewedByUserId: dbUserId,
        reviewedAt: now.toISOString(),
        notes,
      },
    };

    const updated = await db.warrantyClaim.update({
      where: {
        id: claim.id,
      },
      data: {
        status: "submitted",
        submittedAt: now,
        partsCost: Number(partsCost.toFixed(2)),
        laborCost: Number(laborCost.toFixed(2)),
        totalClaimAmount,
        documentation: updatedDocumentation,
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        submittedAt: true,
        totalClaimAmount: true,
      },
    });

    const manufacturerEmail = claim.manufacturerOrg.contactEmail ?? "";

    if (manufacturerEmail) {
      void sendManufacturerClaimSubmittedEmail({
        manufacturerEmail,
        manufacturerName: claim.manufacturerOrg.name,
        claimNumber: updated.claimNumber,
        ticketNumber: claim.ticket.ticketNumber,
        serviceCenterName: claim.serviceCenterOrg.name,
        claimAmount: totalClaimAmount,
      });
    }

    return NextResponse.json({
      claim: {
        id: updated.id,
        claimNumber: updated.claimNumber,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
        totalClaimAmount: toNumber(updated.totalClaimAmount, totalClaimAmount),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

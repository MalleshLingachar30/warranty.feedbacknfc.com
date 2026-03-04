import { NextResponse } from "next/server";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
  toNumber,
} from "../../../manufacturer/_utils";

type ApprovePayload = {
  approvedAmount?: unknown;
};

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId, dbUserId } = await requireManufacturerContext();
    const { id } = await params;

    if (!id) {
      throw new ApiError("Claim id is required.", 400);
    }

    const body = parseJsonBody<ApprovePayload>(await request.json());

    const claim = await db.warrantyClaim.findFirst({
      where: {
        id,
        manufacturerOrgId: organizationId,
      },
      select: {
        id: true,
        claimNumber: true,
        totalClaimAmount: true,
        status: true,
      },
    });

    if (!claim) {
      throw new ApiError("Claim not found.", 404);
    }

    if (claim.status === "paid" || claim.status === "closed") {
      throw new ApiError("This claim cannot be updated anymore.", 409);
    }

    const requestedAmount = toNumber(body.approvedAmount);

    if (requestedAmount !== null && requestedAmount <= 0) {
      throw new ApiError("Approved amount must be greater than zero.", 400);
    }

    const approvedAmount =
      requestedAmount !== null
        ? requestedAmount
        : toNumberValue(claim.totalClaimAmount);

    const updated = await db.warrantyClaim.update({
      where: {
        id: claim.id,
      },
      data: {
        status: "approved",
        approvedAmount,
        approvedAt: new Date(),
        approvedById: dbUserId,
        rejectionReason: null,
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        approvedAmount: true,
        approvedAt: true,
      },
    });

    return NextResponse.json({
      claim: {
        id: updated.id,
        claimNumber: updated.claimNumber,
        status: updated.status,
        approvedAmount: toNumberValue(updated.approvedAmount),
        approvedAt: updated.approvedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

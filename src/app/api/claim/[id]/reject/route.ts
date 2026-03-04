import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sendServiceCenterClaimRejectedEmail } from "@/lib/warranty-notifications";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../../manufacturer/_utils";

type RejectPayload = {
  reason?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const { id } = await params;

    if (!id) {
      throw new ApiError("Claim id is required.", 400);
    }

    const body = parseJsonBody<RejectPayload>(await request.json());
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      throw new ApiError("Rejection reason is required.", 400);
    }

    const claim = await db.warrantyClaim.findFirst({
      where: {
        id,
        manufacturerOrgId: organizationId,
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        serviceCenterOrg: {
          select: {
            name: true,
            contactEmail: true,
          },
        },
      },
    });

    if (!claim) {
      throw new ApiError("Claim not found.", 404);
    }

    if (claim.status === "paid" || claim.status === "closed") {
      throw new ApiError("This claim cannot be updated anymore.", 409);
    }

    const updated = await db.warrantyClaim.update({
      where: {
        id: claim.id,
      },
      data: {
        status: "rejected",
        rejectionReason: reason,
        approvedAmount: null,
        approvedAt: null,
        approvedById: null,
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        rejectionReason: true,
      },
    });

    const serviceCenterEmail = claim.serviceCenterOrg.contactEmail ?? "";

    if (serviceCenterEmail) {
      void sendServiceCenterClaimRejectedEmail({
        serviceCenterEmail,
        serviceCenterName: claim.serviceCenterOrg.name,
        claimNumber: updated.claimNumber,
        reason,
      });
    }

    return NextResponse.json({
      claim: {
        id: updated.id,
        claimNumber: updated.claimNumber,
        status: updated.status,
        rejectionReason: updated.rejectionReason,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

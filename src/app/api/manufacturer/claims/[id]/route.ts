import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  manufacturerClaimDetailSelect,
  mapClaimDocumentation,
} from "@/lib/manufacturer-claim-view";

import { ApiError, jsonError, requireManufacturerContext } from "../../_utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireManufacturerContext();

    const claim = await db.warrantyClaim.findFirst({
      where: {
        id,
        manufacturerOrgId: organizationId,
      },
      select: manufacturerClaimDetailSelect,
    });

    if (!claim) {
      throw new ApiError("Claim not found.", 404);
    }

    return NextResponse.json({
      documentation: mapClaimDocumentation(claim),
    });
  } catch (error) {
    return jsonError(error);
  }
}

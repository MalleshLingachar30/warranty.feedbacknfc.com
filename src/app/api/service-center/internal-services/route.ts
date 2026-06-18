import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveInternalServiceAssetByReference } from "@/lib/internal-services";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "../_utils";
import {
  createInternalServiceOrder,
  type InternalServiceCreatePayload,
  normalizeInternalServiceCreateInput,
} from "../../internal-services/_shared";

export async function POST(request: Request) {
  try {
    const { organizationId, dbUserId } = await requireServiceCenterContext();

    if (!dbUserId) {
      throw new ApiError("Service-center user is not linked to a local user record.", 400);
    }

    const body = parseJsonBody<InternalServiceCreatePayload>(await request.json());
    const normalized = normalizeInternalServiceCreateInput(body);

    const [serviceCenter, asset] = await Promise.all([
      db.serviceCenter.findFirst({
        where: {
          id: normalized.serviceCenterId,
          organizationId,
        },
        select: {
          id: true,
          manufacturerAuthorizations: true,
        },
      }),
      db.$transaction((tx) =>
        resolveInternalServiceAssetByReference(tx, normalized.assetReference),
      ),
    ]);

    if (!serviceCenter) {
      throw new ApiError("Selected depot does not belong to this service-center organization.", 404);
    }

    if (!asset) {
      throw new ApiError("No serialized asset or tag matched the provided reference.", 404);
    }

    if (!serviceCenter.manufacturerAuthorizations.includes(asset.organizationId)) {
      throw new ApiError(
        "This depot is not authorized to inward the selected manufacturer's asset.",
        403,
      );
    }

    const order = await createInternalServiceOrder({
      manufacturerOrgId: asset.organizationId,
      serviceCenterId: serviceCenter.id,
      requestedByUserId: dbUserId,
      receivedByUserId: dbUserId,
      normalized,
      resolvedAsset: asset,
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(new ApiError(error.message, 400));
    }

    return jsonError(error);
  }
}

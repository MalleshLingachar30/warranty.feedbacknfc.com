import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  affixInternalServiceLabel,
  resolveInternalServiceScanContext,
} from "@/lib/internal-services";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireInternalServiceContext,
} from "../../_utils";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireInternalServiceContext();
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim() ?? "";

    if (!code) {
      throw new ApiError("A scan code is required.", 400);
    }

    const authorizedManufacturerIds = Array.from(
      new Set(
        (
          await db.serviceCenter.findMany({
            where: {
              organizationId,
            },
            select: {
              manufacturerAuthorizations: true,
            },
          })
        ).flatMap((serviceCenter) => serviceCenter.manufacturerAuthorizations),
      ),
    );

    if (authorizedManufacturerIds.length === 0) {
      throw new ApiError(
        "This service-center organization has no manufacturer authorizations for internal-service scan resolution.",
        403,
      );
    }

    const scan = await db.$transaction((tx) =>
      resolveInternalServiceScanContext(tx, code, {
        manufacturerOrgIds: authorizedManufacturerIds,
      }),
    );

    return NextResponse.json({ scan });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(new ApiError(error.message, 400));
    }

    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireInternalServiceContext();
    const body = parseJsonBody<{ assetId?: unknown }>(await request.json());
    const assetId =
      typeof body.assetId === "string" && body.assetId.trim().length > 0
        ? body.assetId.trim()
        : "";

    if (!assetId) {
      throw new ApiError("An asset id is required to affix an internal-service label.", 400);
    }

    const serviceCenters = await db.serviceCenter.findMany({
      where: {
        organizationId,
      },
      select: {
        manufacturerAuthorizations: true,
      },
    });

    const authorizedManufacturerIds = Array.from(
      new Set(
        serviceCenters.flatMap((serviceCenter) => serviceCenter.manufacturerAuthorizations),
      ),
    );

    if (authorizedManufacturerIds.length === 0) {
      throw new ApiError(
        "This service-center organization has no manufacturer authorizations for internal-service labels.",
        403,
      );
    }

    const [asset, controllingTag] = await db.$transaction(async (tx) => {
      const assetRecord = await tx.assetIdentity.findFirst({
        where: {
          id: assetId,
          organizationId: {
            in: authorizedManufacturerIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (!assetRecord) {
        throw new ApiError("This asset is not available for this depot network.", 404);
      }

      const nextTag = await affixInternalServiceLabel({
        tx,
        assetId: assetRecord.id,
      });

      return [assetRecord, nextTag] as const;
    });

    return NextResponse.json({
      asset,
      controllingTag,
    });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(new ApiError(error.message, 400));
    }

    return jsonError(error);
  }
}

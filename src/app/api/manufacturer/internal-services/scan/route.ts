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
  requireManufacturerContext,
} from "../../_utils";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim() ?? "";

    if (!code) {
      throw new ApiError("A scan code is required.", 400);
    }

    const scan = await db.$transaction((tx) =>
      resolveInternalServiceScanContext(tx, code, {
        manufacturerOrgId: organizationId,
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
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<{ assetId?: unknown }>(await request.json());
    const assetId =
      typeof body.assetId === "string" && body.assetId.trim().length > 0
        ? body.assetId.trim()
        : "";

    if (!assetId) {
      throw new ApiError("An asset id is required to affix an internal-service label.", 400);
    }

    const controllingTag = await db.$transaction(async (tx) => {
      const asset = await tx.assetIdentity.findFirst({
        where: {
          id: assetId,
          organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!asset) {
        throw new ApiError("This asset does not belong to the current manufacturer.", 404);
      }

      return affixInternalServiceLabel({
        tx,
        assetId: asset.id,
      });
    });

    return NextResponse.json({
      controllingTag,
    });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(new ApiError(error.message, 400));
    }

    return jsonError(error);
  }
}

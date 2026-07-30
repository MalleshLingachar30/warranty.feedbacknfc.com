import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { generatePreventiveMaintenanceEventsForAsset } from "@/lib/preventive-maintenance";
import {
  asBoolean,
  asOptionalDate,
  asOptionalString,
  asPositiveInteger,
} from "@/lib/preventive-maintenance-api";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../../_utils";

export const runtime = "nodejs";

type RegeneratePreventiveMaintenanceEventsPayload = {
  assetId?: unknown;
  productModelId?: unknown;
  warrantyEndDate?: unknown;
  maxEventsWithoutWarrantyEnd?: unknown;
  includeWarrantyEndDate?: unknown;
  limit?: unknown;
};

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<RegeneratePreventiveMaintenanceEventsPayload>(
      await request.json(),
    );

    const assetId = asOptionalString(body.assetId);
    const productModelId = asOptionalString(body.productModelId);
    const warrantyEndDate = asOptionalDate(body.warrantyEndDate);
    const maxEventsWithoutWarrantyEnd = asPositiveInteger(
      body.maxEventsWithoutWarrantyEnd,
    );
    const includeWarrantyEndDate =
      asBoolean(body.includeWarrantyEndDate) ?? undefined;
    const limit = Math.min(asPositiveInteger(body.limit) ?? 50, 200);

    if (assetId && productModelId) {
      throw new ApiError(
        "Use either assetId or productModelId, not both.",
        400,
      );
    }

    const assets = await db.assetIdentity.findMany({
      where: {
        organizationId,
        ...(assetId ? { id: assetId } : {}),
        ...(productModelId ? { productModelId } : {}),
        ...(!assetId
          ? {
              installationDate: {
                not: null,
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: "asc",
      },
      take: limit,
      select: {
        id: true,
        serialNumber: true,
        organizationId: true,
        productModelId: true,
        installationDate: true,
      },
    });

    if (assetId && assets.length === 0) {
      throw new ApiError(
        "Installed asset not found for this manufacturer.",
        404,
      );
    }

    const summaries = [];

    for (const asset of assets) {
      const linkedProduct = asset.serialNumber
        ? await db.product.findFirst({
            where: {
              organizationId: asset.organizationId,
              productModelId: asset.productModelId,
              serialNumber: asset.serialNumber,
            },
            select: {
              warrantyEndDate: true,
            },
          })
        : null;

      const summary = await db.$transaction((tx) =>
        generatePreventiveMaintenanceEventsForAsset({
          tx,
          assetId: asset.id,
          warrantyEndDate: warrantyEndDate ?? linkedProduct?.warrantyEndDate,
          maxEventsWithoutWarrantyEnd: maxEventsWithoutWarrantyEnd ?? undefined,
          includeWarrantyEndDate,
          generationSource: "manual_regeneration",
        }),
      );

      summaries.push(summary);
    }

    return NextResponse.json({
      generatedAssetCount: summaries.length,
      generatedEventCount: summaries.reduce(
        (total, summary) => total + summary.generatedEventCount,
        0,
      ),
      skippedEventCount: summaries.reduce(
        (total, summary) => total + summary.skippedEventCount,
        0,
      ),
      summaries,
    });
  } catch (error) {
    return jsonError(error);
  }
}

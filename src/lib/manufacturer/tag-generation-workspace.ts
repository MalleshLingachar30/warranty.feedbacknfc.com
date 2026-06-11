import "server-only";

import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";
import {
  asTagSymbology,
  formatTagGenerationBatchCode,
  type TagSymbology,
} from "@/lib/asset-generation";
import type {
  ManufacturerProductModel,
  TagGenerationBatchRow,
  TagGenerationSummary,
  TagGenerationWorkspacePayload,
} from "@/components/manufacturer/types";

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function parseOutputSymbologies(
  outputProfile: Prisma.JsonValue,
  fallback: TagSymbology,
) {
  if (!outputProfile || typeof outputProfile !== "object") {
    return [fallback];
  }

  const profile = outputProfile as Record<string, unknown>;
  if (!Array.isArray(profile.symbologies)) {
    return [fallback];
  }

  const values = profile.symbologies
    .map((entry) => asTagSymbology(entry))
    .filter((value): value is TagSymbology => Boolean(value));

  return values.length > 0 ? values : [fallback];
}

export async function getTagGenerationWorkspaceData(
  organizationId: string,
): Promise<TagGenerationWorkspacePayload> {
  return withDatabaseRetry(async () => {
    const [
      models,
      generationBatches,
      totalBatches,
      totalAssets,
      totalTags,
      symbologyCounts,
      mainAssetCounts,
      dispatchStatusCounts,
    ] = await Promise.all([
      db.productModel.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          category: true,
          subCategory: true,
          modelNumber: true,
          externalItemCode: true,
          externalItemSeriesCode: true,
          activationMode: true,
          partTraceabilityMode: true,
          smallPartTrackingMode: true,
        },
      }),
      db.tagGenerationBatch.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          createdAt: true,
          productClass: true,
          quantity: true,
          serialPrefix: true,
          serialStart: true,
          serialEnd: true,
          includeCartonRegistrationTags: true,
          defaultSymbology: true,
          outputProfile: true,
          productModel: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              assets: true,
              tags: true,
            },
          },
        },
        take: 30,
      }),
      db.tagGenerationBatch.count({
        where: {
          organizationId,
        },
      }),
      db.assetIdentity.count({
        where: {
          organizationId,
        },
      }),
      db.assetTag.count({
        where: {
          generationBatch: {
            organizationId,
          },
        },
      }),
      db.assetTag.groupBy({
        by: ["symbology"],
        where: {
          generationBatch: {
            organizationId,
          },
        },
        _count: {
          _all: true,
        },
      }),
      db.assetIdentity.groupBy({
        by: ["productModelId"],
        where: {
          organizationId,
          productClass: "main_product",
        },
        _count: {
          _all: true,
        },
      }),
      db.erpSerializedDispatchRecord.groupBy({
        by: ["productModelId", "status"],
        where: {
          organizationId,
          productModelId: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const productModels: ManufacturerProductModel[] = models.map((model) => ({
      id: model.id,
      name: model.name,
      category: model.category,
      subCategory: model.subCategory ?? "",
      modelNumber: model.modelNumber ?? "",
      externalItemCode: model.externalItemCode ?? "",
      externalItemSeriesCode: model.externalItemSeriesCode ?? "",
      description: "",
      imageUrl: "",
      warrantyDurationMonths: 0,
      totalUnits: 0,
      commonIssues: jsonStringArray([]),
      requiredSkills: [],
      activationMode: model.activationMode,
      partTraceabilityMode: model.partTraceabilityMode,
      smallPartTrackingMode: model.smallPartTrackingMode,
    }));

    const generatedAssetCountByModel = new Map<string, number>();
    for (const row of mainAssetCounts) {
      generatedAssetCountByModel.set(row.productModelId, row._count._all);
    }

    const appliedDispatchCountByModel = new Map<string, number>();
    const pendingDispatchCountByModel = new Map<string, number>();
    for (const row of dispatchStatusCounts) {
      if (!row.productModelId) {
        continue;
      }

      if (row.status === "applied") {
        appliedDispatchCountByModel.set(row.productModelId, row._count._all);
        continue;
      }

      if (row.status === "pending_match") {
        pendingDispatchCountByModel.set(row.productModelId, row._count._all);
      }
    }

    const readinessRows = models
      .map((model) => {
        const generatedAssets = generatedAssetCountByModel.get(model.id) ?? 0;
        const dispatchMatched = appliedDispatchCountByModel.get(model.id) ?? 0;
        const pendingDispatchMatches =
          pendingDispatchCountByModel.get(model.id) ?? 0;

        return {
          productModelId: model.id,
          productModelName: model.name,
          modelNumber: model.modelNumber ?? "",
          externalItemCode: model.externalItemCode,
          externalItemSeriesCode: model.externalItemSeriesCode,
          generatedAssets,
          readyForDispatch: Math.max(generatedAssets - dispatchMatched, 0),
          dispatchMatched,
          pendingDispatchMatches,
        };
      })
      .filter(
        (row) =>
          row.generatedAssets > 0 ||
          row.dispatchMatched > 0 ||
          row.pendingDispatchMatches > 0,
      )
      .sort((left, right) => {
        if (right.pendingDispatchMatches !== left.pendingDispatchMatches) {
          return right.pendingDispatchMatches - left.pendingDispatchMatches;
        }

        if (right.generatedAssets !== left.generatedAssets) {
          return right.generatedAssets - left.generatedAssets;
        }

        return left.productModelName.localeCompare(right.productModelName);
      });

    const symbologyMap = new Map<TagSymbology, number>();
    for (const row of symbologyCounts) {
      symbologyMap.set(row.symbology, row._count._all);
    }

    const batchIds = generationBatches.map((batch) => batch.id);
    const batchSymbologyCounts =
      batchIds.length === 0
        ? []
        : await db.assetTag.groupBy({
            by: ["generationBatchId", "symbology"],
            where: {
              generationBatchId: {
                in: batchIds,
              },
            },
            _count: {
              _all: true,
            },
          });

    const batchSymbologyMap = new Map<
      string,
      Partial<Record<TagSymbology, number>>
    >();
    for (const row of batchSymbologyCounts) {
      if (!row.generationBatchId) {
        continue;
      }
      const current = batchSymbologyMap.get(row.generationBatchId) ?? {};
      current[row.symbology] = row._count._all;
      batchSymbologyMap.set(row.generationBatchId, current);
    }

    const batches: TagGenerationBatchRow[] = generationBatches.map((batch) => ({
      id: batch.id,
      batchCode: formatTagGenerationBatchCode(batch.id, batch.createdAt),
      createdAt: batch.createdAt.toISOString(),
      productClass: batch.productClass,
      quantity: batch.quantity,
      serialPrefix: batch.serialPrefix,
      serialStart: batch.serialStart,
      serialEnd: batch.serialEnd,
      includeCartonRegistrationTags: batch.includeCartonRegistrationTags,
      defaultSymbology: batch.defaultSymbology,
      symbologies: parseOutputSymbologies(
        batch.outputProfile as Prisma.JsonValue,
        batch.defaultSymbology,
      ),
      productModel: {
        id: batch.productModel.id,
        name: batch.productModel.name,
      },
      assetsGenerated: batch._count.assets,
      tagsGenerated: batch._count.tags,
      tagCountBySymbology: batchSymbologyMap.get(batch.id) ?? {},
    }));

    const summary: TagGenerationSummary = {
      totalBatches,
      totalAssets,
      totalTags,
      qrTags: symbologyMap.get("qr") ?? 0,
      dataMatrixTags: symbologyMap.get("data_matrix") ?? 0,
      nfcTags: symbologyMap.get("nfc_uri") ?? 0,
      readyForDispatch: readinessRows.reduce(
        (accumulator, row) => accumulator + row.readyForDispatch,
        0,
      ),
      dispatchMatched: readinessRows.reduce(
        (accumulator, row) => accumulator + row.dispatchMatched,
        0,
      ),
      pendingDispatchMatches: readinessRows.reduce(
        (accumulator, row) => accumulator + row.pendingDispatchMatches,
        0,
      ),
    };

    return {
      productModels,
      readinessRows,
      batches,
      summary,
    };
  });
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  ASSET_PRODUCT_CLASSES,
  asAssetProductClass,
  asTagMaterialVariant,
  asTagSymbology,
  asTagViewerPolicy,
  buildAssetPublicCode,
  buildTagEncodedValue,
  buildTagPublicCode,
  formatSerialNumber,
  formatTagGenerationBatchCode,
  recommendedSymbologiesFromPolicy,
  tagClassForProductClass,
  type TagSymbology,
} from "@/lib/asset-generation";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
  toNumber,
} from "../../_utils";

const MAX_BATCH_QUANTITY = 5000;

type CreateBatchPayload = {
  productModelId?: unknown;
  productClass?: unknown;
  quantity?: unknown;
  serialPrefix?: unknown;
  serialStart?: unknown;
  serialPadLength?: unknown;
  includeCartonRegistrationTags?: unknown;
  defaultSymbology?: unknown;
  symbologies?: unknown;
  materialVariant?: unknown;
  printSizeMm?: unknown;
  viewerPolicy?: unknown;
  outputProfile?: unknown;
};

type OutputProfile = {
  symbologies: TagSymbology[];
  serialPadLength?: number;
  format?: string;
  notes?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSymbologies(value: unknown): TagSymbology[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<TagSymbology>();

  for (const entry of value) {
    const parsed = asTagSymbology(entry);
    if (parsed) {
      unique.add(parsed);
    }
  }

  return [...unique];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseOutputProfile(
  rawValue: Prisma.JsonValue,
  defaultSymbology: TagSymbology,
): OutputProfile {
  const record = asRecord(rawValue);
  if (!record) {
    return {
      symbologies: [defaultSymbology],
    };
  }

  const symbologies = parseSymbologies(record.symbologies);
  const serialPadLengthValue = toNumber(record.serialPadLength);
  const format = asString(record.format);
  const notes = asString(record.notes);

  return {
    symbologies: symbologies.length > 0 ? symbologies : [defaultSymbology],
    serialPadLength:
      serialPadLengthValue && Number.isInteger(serialPadLengthValue)
        ? serialPadLengthValue
        : undefined,
    format: format || undefined,
    notes: notes || undefined,
  };
}

function summarizeSymbologyCounts(
  rows: Array<{ generationBatchId: string | null; symbology: TagSymbology; _count: number }>,
) {
  const map = new Map<string, Partial<Record<TagSymbology, number>>>();

  for (const row of rows) {
    if (!row.generationBatchId) {
      continue;
    }

    const existing = map.get(row.generationBatchId) ?? {};
    existing[row.symbology] = row._count;
    map.set(row.generationBatchId, existing);
  }

  return map;
}

export async function POST(request: Request) {
  try {
    const { organizationId, dbUserId } = await requireManufacturerContext();
    if (!dbUserId) {
      throw new ApiError(
        "Your manufacturer account is missing a linked platform user. Run the user bootstrap and retry.",
        400,
      );
    }

    const body = parseJsonBody<CreateBatchPayload>(await request.json());
    const productModelId = asString(body.productModelId);
    const productClass = asAssetProductClass(body.productClass);
    const quantity = toNumber(body.quantity);
    const serialPrefix = asString(body.serialPrefix);
    const serialStart = toNumber(body.serialStart);
    const requestedSerialPadLength = toNumber(body.serialPadLength);
    const includeCartonRegistrationTags =
      body.includeCartonRegistrationTags === true;
    const requestedSymbologies = parseSymbologies(body.symbologies);
    const defaultSymbology = asTagSymbology(body.defaultSymbology);
    const materialVariant = asTagMaterialVariant(body.materialVariant) ?? "standard";
    const viewerPolicy = asTagViewerPolicy(body.viewerPolicy) ?? "public";
    const printSizeMm = toNumber(body.printSizeMm);

    if (!productModelId || !isUuid(productModelId)) {
      throw new ApiError("A valid product model is required.", 400);
    }

    if (!productClass) {
      throw new ApiError(
        `productClass is required and must be one of: ${ASSET_PRODUCT_CLASSES.join(", ")}.`,
        400,
      );
    }

    if (!quantity || !Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiError("quantity must be a positive integer.", 400);
    }

    if (quantity > MAX_BATCH_QUANTITY) {
      throw new ApiError(
        `Maximum ${MAX_BATCH_QUANTITY.toLocaleString()} assets can be generated per batch.`,
        400,
      );
    }

    if (serialStart !== null) {
      if (!Number.isInteger(serialStart) || serialStart < 0) {
        throw new ApiError("serialStart must be a non-negative integer.", 400);
      }

      if (!serialPrefix) {
        throw new ApiError(
          "serialPrefix is required when serialStart is provided.",
          400,
        );
      }
    }

    if (serialPrefix && serialStart === null) {
      throw new ApiError(
        "serialStart is required when serialPrefix is provided.",
        400,
      );
    }

    const productModel = await db.productModel.findFirst({
      where: {
        id: productModelId,
        organizationId,
      },
      select: {
        id: true,
        name: true,
        activationMode: true,
        partTraceabilityMode: true,
        smallPartTrackingMode: true,
      },
    });

    if (!productModel) {
      throw new ApiError("Selected product model was not found.", 404);
    }

    const recommendedSymbologies = recommendedSymbologiesFromPolicy({
      productClass,
      activationMode: productModel.activationMode,
      partTraceabilityMode: productModel.partTraceabilityMode,
      smallPartTrackingMode: productModel.smallPartTrackingMode,
    });

    const symbologies =
      requestedSymbologies.length > 0
        ? requestedSymbologies
        : recommendedSymbologies;

    if (symbologies.length === 0) {
      throw new ApiError("At least one symbology must be selected.", 400);
    }

    const resolvedDefaultSymbology =
      defaultSymbology && symbologies.includes(defaultSymbology)
        ? defaultSymbology
        : symbologies[0];

    if (!symbologies.includes(resolvedDefaultSymbology)) {
      throw new ApiError(
        "defaultSymbology must be one of the selected symbologies.",
        400,
      );
    }

    const serialPadLength =
      requestedSerialPadLength &&
      Number.isInteger(requestedSerialPadLength) &&
      requestedSerialPadLength >= 1 &&
      requestedSerialPadLength <= 20
        ? requestedSerialPadLength
        : serialStart !== null
          ? Math.max(String(serialStart).length, 5)
          : 0;

    let serials: string[] = [];
    if (serialStart !== null) {
      serials = Array.from({ length: quantity }, (_, offset) =>
        formatSerialNumber({
          prefix: serialPrefix,
          start: serialStart,
          offset,
          padLength: serialPadLength,
        }),
      );

      const serialConflicts = await db.assetIdentity.findMany({
        where: {
          organizationId,
          productModelId,
          serialNumber: {
            in: serials,
          },
        },
        select: {
          serialNumber: true,
        },
        take: 5,
      });

      if (serialConflicts.length > 0) {
        const sample = serialConflicts
          .map((entry) => entry.serialNumber)
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
        throw new ApiError(
          `Serial numbers already exist for this model (${sample || "conflict detected"}). Choose a different serial range.`,
          409,
        );
      }
    }

    const createdAt = new Date();
    const batchId = crypto.randomUUID();
    const batchCode = formatTagGenerationBatchCode(batchId, createdAt);
    const tagClass = tagClassForProductClass(productClass);
    const shouldIncludeCartonTags =
      productClass === "main_product" && includeCartonRegistrationTags;

    const assetRows = Array.from({ length: quantity }, (_, index) => {
      const id = crypto.randomUUID();
      return {
        id,
        publicCode: buildAssetPublicCode(batchId, index),
        organizationId,
        productModelId,
        productClass,
        serialNumber: serials[index] ?? null,
        batchCode,
        lifecycleState: "generated" as const,
        warrantyState:
          productClass === "main_product"
            ? ("pending_activation" as const)
            : null,
        metadata: {
          source: "manufacturer_tag_generation",
          sequence: index + 1,
        } as Prisma.InputJsonValue,
        generationBatchId: batchId,
      };
    });

    let tagOffset = 0;
    const tagRows = assetRows.flatMap((asset) => {
      const unitTags = symbologies.map((symbology) => {
        const publicCode = buildTagPublicCode({
          batchId,
          offset: tagOffset,
          tagClass,
          symbology,
        });
        tagOffset += 1;

        return {
          id: crypto.randomUUID(),
          publicCode,
          assetId: asset.id,
          generationBatchId: batchId,
          tagClass,
          symbology,
          status: "generated" as const,
          materialVariant,
          printSizeMm:
            printSizeMm && Number.isInteger(printSizeMm) && printSizeMm > 0
              ? printSizeMm
              : null,
          encodedValue: buildTagEncodedValue(publicCode, symbology),
          viewerPolicy,
        };
      });

      if (!shouldIncludeCartonTags) {
        return unitTags;
      }

      const cartonPublicCode = buildTagPublicCode({
        batchId,
        offset: tagOffset,
        tagClass: "carton_registration",
        symbology: "qr",
      });
      tagOffset += 1;

      return [
        ...unitTags,
        {
          id: crypto.randomUUID(),
          publicCode: cartonPublicCode,
          assetId: asset.id,
          generationBatchId: batchId,
          tagClass: "carton_registration" as const,
          symbology: "qr" as const,
          status: "generated" as const,
          materialVariant,
          printSizeMm:
            printSizeMm && Number.isInteger(printSizeMm) && printSizeMm > 0
              ? printSizeMm
              : null,
          encodedValue: buildTagEncodedValue(cartonPublicCode, "qr"),
          viewerPolicy,
        },
      ];
    });

    const requestOutputProfile = asRecord(body.outputProfile);
    const outputProfile: Record<string, unknown> = {
      symbologies,
    };

    if (serialPadLength > 0) {
      outputProfile.serialPadLength = serialPadLength;
    }

    const outputFormat = asString(requestOutputProfile?.format);
    if (outputFormat) {
      outputProfile.format = outputFormat;
    }

    const outputNotes = asString(requestOutputProfile?.notes);
    if (outputNotes) {
      outputProfile.notes = outputNotes;
    }

    const batch = await db.$transaction(async (tx) => {
      const createdBatch = await tx.tagGenerationBatch.create({
        data: {
          id: batchId,
          organizationId,
          productModelId,
          productClass,
          quantity,
          serialPrefix: serialPrefix || null,
          serialStart: serialStart !== null ? String(serialStart) : null,
          serialEnd:
            serialStart !== null ? String(serialStart + quantity - 1) : null,
          includeCartonRegistrationTags: shouldIncludeCartonTags,
          defaultSymbology: resolvedDefaultSymbology,
          outputProfile: outputProfile as Prisma.InputJsonValue,
          createdById: dbUserId,
          createdAt,
        },
        select: {
          id: true,
          createdAt: true,
          quantity: true,
          productClass: true,
          defaultSymbology: true,
          includeCartonRegistrationTags: true,
          productModel: {
            select: {
              name: true,
            },
          },
        },
      });

      await tx.assetIdentity.createMany({
        data: assetRows,
      });

      await tx.assetTag.createMany({
        data: tagRows,
      });

      return createdBatch;
    });

    const symbologyCounts = tagRows.reduce(
      (acc, row) => {
        acc[row.symbology] = (acc[row.symbology] ?? 0) + 1;
        return acc;
      },
      {} as Partial<Record<TagSymbology, number>>,
    );

    return NextResponse.json({
      batch: {
        id: batch.id,
        batchCode: formatTagGenerationBatchCode(batch.id, batch.createdAt),
        createdAt: batch.createdAt.toISOString(),
        productModelName: batch.productModel.name,
        productClass: batch.productClass,
        quantity: batch.quantity,
        includeCartonRegistrationTags: batch.includeCartonRegistrationTags,
        defaultSymbology: batch.defaultSymbology,
        symbologies,
        serialPrefix: serialPrefix || null,
        serialStart: serialStart !== null ? String(serialStart) : null,
        serialEnd:
          serialStart !== null ? String(serialStart + quantity - 1) : null,
        assetsGenerated: assetRows.length,
        tagsGenerated: tagRows.length,
        tagCountBySymbology: symbologyCounts,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const url = new URL(request.url);
    const limitValue = toNumber(url.searchParams.get("limit"));
    const limit =
      limitValue && Number.isInteger(limitValue)
        ? Math.max(1, Math.min(limitValue, 100))
        : 30;

    const batches = await db.tagGenerationBatch.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
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
    });

    const batchIds = batches.map((batch) => batch.id);
    const symbologyRows =
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

    const symbologySummary = summarizeSymbologyCounts(
      symbologyRows.map((row) => ({
        generationBatchId: row.generationBatchId,
        symbology: row.symbology,
        _count: row._count._all,
      })),
    );

    return NextResponse.json({
      batches: batches.map((batch) => {
        const outputProfile = parseOutputProfile(
          batch.outputProfile as Prisma.JsonValue,
          batch.defaultSymbology,
        );
        return {
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
          symbologies: outputProfile.symbologies,
          outputProfile,
          productModel: batch.productModel,
          assetsGenerated: batch._count.assets,
          tagsGenerated: batch._count.tags,
          tagCountBySymbology: symbologySummary.get(batch.id) ?? {},
        };
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

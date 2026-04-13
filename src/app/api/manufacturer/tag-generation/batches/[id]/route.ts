import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  asTagSymbology,
  formatTagGenerationBatchCode,
  type TagSymbology,
} from "@/lib/asset-generation";

import { ApiError, jsonError, requireManufacturerContext } from "../../../_utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

function parseOutputProfile(
  rawValue: Prisma.JsonValue,
  defaultSymbology: TagSymbology,
) {
  const record = asRecord(rawValue);
  if (!record) {
    return { symbologies: [defaultSymbology] };
  }

  const symbologies = parseSymbologies(record.symbologies);
  return {
    symbologies: symbologies.length > 0 ? symbologies : [defaultSymbology],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const { id } = await params;

    if (!id) {
      throw new ApiError("Batch id is required.", 400);
    }

    const batch = await db.tagGenerationBatch.findFirst({
      where: {
        id,
        organizationId,
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
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
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

    if (!batch) {
      throw new ApiError("Tag generation batch not found.", 404);
    }

    const [assetsPreview, tagsPreview, tagSymbologyStats, tagClassStats] =
      await Promise.all([
        db.assetIdentity.findMany({
          where: {
            generationBatchId: batch.id,
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 25,
          select: {
            id: true,
            publicCode: true,
            serialNumber: true,
            lifecycleState: true,
          },
        }),
        db.assetTag.findMany({
          where: {
            generationBatchId: batch.id,
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 40,
          select: {
            id: true,
            publicCode: true,
            tagClass: true,
            symbology: true,
            status: true,
            encodedValue: true,
            asset: {
              select: {
                publicCode: true,
              },
            },
          },
        }),
        db.assetTag.groupBy({
          by: ["symbology"],
          where: {
            generationBatchId: batch.id,
          },
          _count: {
            _all: true,
          },
        }),
        db.assetTag.groupBy({
          by: ["tagClass"],
          where: {
            generationBatchId: batch.id,
          },
          _count: {
            _all: true,
          },
        }),
      ]);

    const outputProfile = parseOutputProfile(
      batch.outputProfile as Prisma.JsonValue,
      batch.defaultSymbology,
    );

    return NextResponse.json({
      batch: {
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
        productModel: batch.productModel,
        createdBy: batch.createdBy,
        assetsGenerated: batch._count.assets,
        tagsGenerated: batch._count.tags,
      },
      assetsPreview: assetsPreview.map((asset) => ({
        id: asset.id,
        publicCode: asset.publicCode,
        serialNumber: asset.serialNumber,
        lifecycleState: asset.lifecycleState,
      })),
      tagsPreview: tagsPreview.map((tag) => ({
        id: tag.id,
        publicCode: tag.publicCode,
        tagClass: tag.tagClass,
        symbology: tag.symbology,
        status: tag.status,
        encodedValue: tag.encodedValue,
        assetPublicCode: tag.asset.publicCode,
      })),
      tagStats: {
        bySymbology: tagSymbologyStats.map((row) => ({
          symbology: row.symbology,
          count: row._count._all,
        })),
        byTagClass: tagClassStats.map((row) => ({
          tagClass: row.tagClass,
          count: row._count._all,
        })),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

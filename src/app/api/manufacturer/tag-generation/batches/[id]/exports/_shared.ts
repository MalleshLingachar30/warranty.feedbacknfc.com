import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  asTagSymbology,
  formatTagGenerationBatchCode,
  type TagSymbology,
} from "@/lib/asset-generation";

import { ApiError } from "../../../../_utils";

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
    serialPadLength:
      typeof record.serialPadLength === "number" &&
      Number.isInteger(record.serialPadLength)
        ? record.serialPadLength
        : null,
    format:
      typeof record.format === "string" && record.format.trim()
        ? record.format.trim()
        : null,
  };
}

export async function getOwnedBatchExportData(input: {
  organizationId: string;
  batchId: string;
  symbology?: TagSymbology;
}) {
  const batch = await db.tagGenerationBatch.findFirst({
    where: {
      id: input.batchId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      createdAt: true,
      quantity: true,
      productClass: true,
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
          modelNumber: true,
        },
      },
    },
  });

  if (!batch) {
    throw new ApiError("Tag generation batch not found.", 404);
  }

  const tagFilter = input.symbology
    ? {
        generationBatchId: batch.id,
        symbology: input.symbology,
      }
    : {
        generationBatchId: batch.id,
      };

  const tags = await db.assetTag.findMany({
    where: tagFilter,
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      publicCode: true,
      tagClass: true,
      symbology: true,
      status: true,
      printSizeMm: true,
      encodedValue: true,
      asset: {
        select: {
          id: true,
          publicCode: true,
          serialNumber: true,
          productClass: true,
          batchCode: true,
        },
      },
    },
  });

  return {
    batch: {
      ...batch,
      batchCode: formatTagGenerationBatchCode(batch.id, batch.createdAt),
      outputProfile: parseOutputProfile(
        batch.outputProfile as Prisma.JsonValue,
        batch.defaultSymbology,
      ),
    },
    tags,
  };
}

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { PartScanPayload } from "@/lib/part-scan-handoff";
import {
  defaultTagClassForPartAssetClass,
  isSupportedPartScanAssetClass,
  isSupportedPartScanTagClass,
} from "@/lib/part-scan-handoff";
import { normalizeScannedValue } from "@/lib/mobile-code-scanner";

type DbClient = PrismaClient | Prisma.TransactionClient;

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPartScanPayload(input: {
  assetCode: string;
  tagCode: string;
  assetClass: PartScanPayload["assetClass"];
  tagClass: PartScanPayload["tagClass"];
  organizationId: string;
  metadata: Prisma.JsonValue;
  batchCode: string | null;
  resolverCode: string | null;
}): PartScanPayload {
  const metadata = asRecord(input.metadata);

  return {
    assetCode: input.assetCode,
    tagCode: input.tagCode,
    assetClass: input.assetClass,
    tagClass: input.tagClass,
    organizationId: input.organizationId,
    partName: asNonEmptyString(metadata.partName) ?? asNonEmptyString(metadata.name),
    partNumber:
      asNonEmptyString(metadata.partNumber) ??
      asNonEmptyString(metadata.partCode) ??
      asNonEmptyString(metadata.itemCode),
    batchCode: input.batchCode,
    resolverCode: input.resolverCode,
  };
}

export async function resolvePartScanPayloadByReference(
  db: DbClient,
  reference: string,
  options?: {
    organizationId?: string | null;
  },
): Promise<PartScanPayload | null> {
  const normalized = normalizeScannedValue(reference);

  if (!normalized) {
    return null;
  }

  const organizationId = options?.organizationId ?? null;

  const tagMatch = await db.assetTag.findFirst({
    where: {
      OR: [
        {
          publicCode: {
            equals: normalized,
            mode: "insensitive",
          },
        },
        {
          microResolverCode: {
            equals: normalized,
            mode: "insensitive",
          },
        },
        {
          encodedValue: {
            equals: reference.trim(),
            mode: "insensitive",
          },
        },
      ],
      asset: organizationId
        ? {
            organizationId,
          }
        : undefined,
    },
    select: {
      publicCode: true,
      microResolverCode: true,
      tagClass: true,
      asset: {
        select: {
          organizationId: true,
          publicCode: true,
          productClass: true,
          batchCode: true,
          metadata: true,
        },
      },
    },
  });

  if (tagMatch) {
    if (
      !isSupportedPartScanAssetClass(tagMatch.asset.productClass) ||
      !isSupportedPartScanTagClass(tagMatch.tagClass)
    ) {
      return null;
    }

    return toPartScanPayload({
      assetCode: tagMatch.asset.publicCode,
      tagCode: tagMatch.publicCode,
      assetClass: tagMatch.asset.productClass,
      tagClass: tagMatch.tagClass,
      organizationId: tagMatch.asset.organizationId,
      metadata: tagMatch.asset.metadata,
      batchCode: tagMatch.asset.batchCode,
      resolverCode: tagMatch.microResolverCode ?? tagMatch.publicCode,
    });
  }

  const assetMatch = await db.assetIdentity.findFirst({
    where: {
      OR: [
        {
          publicCode: {
            equals: normalized,
            mode: "insensitive",
          },
        },
        {
          serialNumber: {
            equals: normalized,
            mode: "insensitive",
          },
        },
      ],
      organizationId: organizationId ?? undefined,
    },
    select: {
      organizationId: true,
      publicCode: true,
      productClass: true,
      batchCode: true,
      metadata: true,
      tags: {
        where: {
          tagClass: {
            in: [
              "component_unit",
              "small_part_batch",
              "kit_parent",
              "pack_parent",
            ],
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
        select: {
          publicCode: true,
          microResolverCode: true,
          tagClass: true,
        },
      },
    },
  });

  if (!assetMatch || !isSupportedPartScanAssetClass(assetMatch.productClass)) {
    return null;
  }

  const assetTag = assetMatch.tags[0] ?? null;
  const tagClass =
    assetTag && isSupportedPartScanTagClass(assetTag.tagClass)
      ? assetTag.tagClass
      : defaultTagClassForPartAssetClass(assetMatch.productClass);

  return toPartScanPayload({
    assetCode: assetMatch.publicCode,
    tagCode: assetTag?.publicCode ?? "",
    assetClass: assetMatch.productClass,
    tagClass,
    organizationId: assetMatch.organizationId,
    metadata: assetMatch.metadata,
    batchCode: assetMatch.batchCode,
    resolverCode:
      assetTag?.microResolverCode ?? assetTag?.publicCode ?? normalized,
  });
}

import {
  Prisma,
  type PartTraceabilityMode,
  type PartUsageType,
  type SmallPartTrackingMode,
} from "@prisma/client";

type GenericRecord = Record<string, unknown>;

type UsageResolutionAsset = {
  id: string;
  publicCode: string;
  productClass: "main_product" | "spare_part" | "small_part" | "kit" | "pack";
  serialNumber: string | null;
  metadata: Prisma.JsonValue;
};

type UsageResolutionTag = {
  id: string;
  publicCode: string;
  assetId: string;
  asset: UsageResolutionAsset;
};

export type NormalizedPartUsageInput = {
  assetCode: string | null;
  tagCode: string | null;
  usageType: PartUsageType;
  quantity: number;
  unitCost: number | null;
  partName: string | null;
  partNumber: string | null;
  catalogPartId: string | null;
  note: string | null;
};

export type ResolvedPartUsage = {
  input: NormalizedPartUsageInput;
  usedAsset: UsageResolutionAsset;
  usedTag: UsageResolutionTag | null;
};

export type PartUsagePolicy = {
  partTraceabilityMode: PartTraceabilityMode;
  smallPartTrackingMode: SmallPartTrackingMode;
  includedKitDefinition: Prisma.JsonValue;
};

const INDIVIDUALLY_TRACKED_USAGE_TYPES: PartUsageType[] = ["installed", "consumed"];
const PACK_OR_KIT_CLASSES = new Set(["pack", "kit"]);

function asRecord(value: unknown): GenericRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as GenericRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPositiveNumber(value: unknown, fallback = 1): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Number(parsed.toFixed(3));
}

function parseUsageType(
  value: unknown,
  fallback: PartUsageType,
): PartUsageType {
  switch (value) {
    case "installed":
    case "consumed":
    case "returned_unused":
    case "removed":
      return value;
    default:
      return fallback;
  }
}

function toCanonicalCode(value: string | null): string | null {
  return value ? value.trim().toLowerCase() : null;
}

function parseRequiredTokens(value: unknown): string[] {
  const root = asRecord(value);
  const tokens = new Set<string>();

  const addToken = (candidate: unknown) => {
    const text = asString(candidate);
    if (!text) {
      return;
    }

    tokens.add(text.toLowerCase());
  };

  const addTokenList = (candidate: unknown) => {
    if (!Array.isArray(candidate)) {
      return;
    }

    for (const entry of candidate) {
      if (typeof entry === "string") {
        addToken(entry);
        continue;
      }

      const record = asRecord(entry);
      addToken(record.kitCode);
      addToken(record.assetCode);
      addToken(record.code);
      addToken(record.partCode);
      addToken(record.partNumber);
      addToken(record.publicCode);
    }
  };

  addToken(root.kitCode);
  addToken(root.assetCode);
  addToken(root.code);
  addTokenList(root.requiredKitCodes);
  addTokenList(root.kitCodes);
  addTokenList(root.kits);
  addTokenList(root.parts);

  return [...tokens];
}

function usageTokens(usage: ResolvedPartUsage): Set<string> {
  const tokens = new Set<string>();
  const add = (candidate: unknown) => {
    const text = asString(candidate);
    if (text) {
      tokens.add(text.toLowerCase());
    }
  };

  add(usage.input.assetCode);
  add(usage.input.tagCode);
  add(usage.input.partNumber);
  add(usage.input.partName);
  add(usage.usedAsset.publicCode);
  add(usage.usedAsset.serialNumber);
  add(usage.usedTag?.publicCode);

  const metadata = asRecord(usage.usedAsset.metadata);
  add(metadata.partCode);
  add(metadata.partNumber);
  add(metadata.itemCode);
  add(metadata.erpItemCode);
  add(metadata.code);

  return tokens;
}

async function ensureUniqueIndividuallyTrackedUsage(
  tx: Prisma.TransactionClient,
  input: {
    mainAssetId: string;
    usages: ResolvedPartUsage[];
  },
) {
  const checkedAssetIds = new Set<string>();

  for (const usage of input.usages) {
    if (
      !INDIVIDUALLY_TRACKED_USAGE_TYPES.includes(usage.input.usageType) ||
      PACK_OR_KIT_CLASSES.has(usage.usedAsset.productClass)
    ) {
      continue;
    }

    if (checkedAssetIds.has(usage.usedAsset.id)) {
      continue;
    }
    checkedAssetIds.add(usage.usedAsset.id);

    const history = await tx.jobPartUsage.findMany({
      where: {
        usedAssetId: usage.usedAsset.id,
      },
      orderBy: [{ linkedAt: "asc" }, { createdAt: "asc" }],
      select: {
        mainAssetId: true,
        usageType: true,
      },
    });

    const activeMainAssetIds = new Set<string>();

    for (const row of history) {
      if (
        row.usageType === "installed" ||
        row.usageType === "consumed"
      ) {
        activeMainAssetIds.add(row.mainAssetId);
        continue;
      }

      activeMainAssetIds.delete(row.mainAssetId);
    }

    for (const activeMainAssetId of activeMainAssetIds) {
      if (activeMainAssetId !== input.mainAssetId) {
        throw new Error(
          `Part ${usage.usedAsset.publicCode} is already linked to another active main asset.`,
        );
      }
    }
  }
}

export function parsePartUsageInputs(input: {
  value: unknown;
  defaultUsageType: PartUsageType;
}): NormalizedPartUsageInput[] {
  if (!Array.isArray(input.value)) {
    return [];
  }

  return input.value
    .map((entry) => {
      const record = asRecord(entry);
      const assetCode = asString(record.assetCode ?? record.usedAssetCode);
      const tagCode = asString(record.tagCode ?? record.usedTagCode);
      const partName = asString(record.partName);
      const partNumber = asString(record.partNumber);
      const catalogPartId = asString(record.catalogPartId);
      const note = asString(record.note ?? record.notes);
      const usageType = parseUsageType(record.usageType, input.defaultUsageType);
      const quantity = toPositiveNumber(record.quantity, 1);
      const unitCost = toPositiveNumber(record.unitCost ?? record.cost, 0);

      if (!assetCode && !tagCode && !partName && !partNumber) {
        return null;
      }

      return {
        assetCode,
        tagCode,
        usageType,
        quantity,
        unitCost: unitCost > 0 ? unitCost : null,
        partName,
        partNumber,
        catalogPartId,
        note,
      } satisfies NormalizedPartUsageInput;
    })
    .filter((entry): entry is NormalizedPartUsageInput => Boolean(entry));
}

export async function resolvePartUsages(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    parsedUsages: NormalizedPartUsageInput[];
  },
): Promise<ResolvedPartUsage[]> {
  if (input.parsedUsages.length === 0) {
    return [];
  }

  const assetCodes = new Set<string>();
  const tagCodes = new Set<string>();

  for (const usage of input.parsedUsages) {
    if (usage.assetCode) {
      assetCodes.add(usage.assetCode);
    }
    if (usage.tagCode) {
      tagCodes.add(usage.tagCode);
    }
  }

  const [assets, tags] = await Promise.all([
    assetCodes.size > 0
      ? tx.assetIdentity.findMany({
          where: {
            organizationId: input.organizationId,
            publicCode: {
              in: [...assetCodes],
            },
          },
          select: {
            id: true,
            publicCode: true,
            productClass: true,
            serialNumber: true,
            metadata: true,
          },
        })
      : Promise.resolve([]),
    tagCodes.size > 0
      ? tx.assetTag.findMany({
          where: {
            publicCode: {
              in: [...tagCodes],
            },
            asset: {
              organizationId: input.organizationId,
            },
          },
          select: {
            id: true,
            publicCode: true,
            assetId: true,
            asset: {
              select: {
                id: true,
                publicCode: true,
                productClass: true,
                serialNumber: true,
                metadata: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const assetByCode = new Map(assets.map((asset) => [asset.publicCode, asset]));
  const tagByCode = new Map(tags.map((tag) => [tag.publicCode, tag]));

  return input.parsedUsages.map((usage, index) => {
    const assetFromCode = usage.assetCode ? assetByCode.get(usage.assetCode) : null;
    const tagFromCode = usage.tagCode ? tagByCode.get(usage.tagCode) : null;

    if (usage.assetCode && !assetFromCode) {
      throw new Error(`Part asset code not found at row ${index + 1}: ${usage.assetCode}.`);
    }

    if (usage.tagCode && !tagFromCode) {
      throw new Error(`Part tag code not found at row ${index + 1}: ${usage.tagCode}.`);
    }

    const usedAsset = assetFromCode ?? tagFromCode?.asset ?? null;
    if (!usedAsset) {
      throw new Error(`Row ${index + 1} must include a valid part asset or tag code.`);
    }

    if (usedAsset.productClass === "main_product") {
      throw new Error(
        `Row ${index + 1} uses ${usedAsset.publicCode}, which is a main product and cannot be linked as a spare/kit/pack.`,
      );
    }

    if (assetFromCode && tagFromCode && assetFromCode.id !== tagFromCode.assetId) {
      throw new Error(
        `Row ${index + 1} has mismatched asset and tag codes (${usage.assetCode} / ${usage.tagCode}).`,
      );
    }

    return {
      input: usage,
      usedAsset,
      usedTag: tagFromCode ?? null,
    } satisfies ResolvedPartUsage;
  });
}

export async function validatePartUsagePolicy(
  tx: Prisma.TransactionClient,
  input: {
    policy: PartUsagePolicy;
    mainAssetId: string;
    resolvedUsages: ResolvedPartUsage[];
    workObjectLabel: string;
    requireCaptureForPolicy: boolean;
  },
) {
  if (input.requireCaptureForPolicy && input.resolvedUsages.length === 0) {
    throw new Error(
      `Part traceability is mandatory for this model. Add at least one linked part usage before completing ${input.workObjectLabel}.`,
    );
  }

  for (let index = 0; index < input.resolvedUsages.length; index += 1) {
    const usage = input.resolvedUsages[index];
    const rowLabel = `row ${index + 1}`;

    if (
      input.policy.partTraceabilityMode === "unit_scan_mandatory" &&
      !PACK_OR_KIT_CLASSES.has(usage.usedAsset.productClass) &&
      !usage.usedTag
    ) {
      throw new Error(
        `Unit scan is mandatory for ${rowLabel}. Provide a scanned tag code for individually tracked parts.`,
      );
    }

    if (
      input.policy.smallPartTrackingMode === "pack_level" &&
      usage.usedAsset.productClass === "small_part"
    ) {
      throw new Error(
        `Small parts require pack-level tracking for ${rowLabel}. Link the containing pack asset instead of an individual small-part asset.`,
      );
    }

    if (
      input.policy.smallPartTrackingMode === "kit_level" &&
      usage.usedAsset.productClass === "small_part"
    ) {
      throw new Error(
        `Small parts require kit-level tracking for ${rowLabel}. Link the containing kit asset instead of an individual small-part asset.`,
      );
    }

    if (
      input.policy.smallPartTrackingMode === "pack_or_kit" &&
      usage.usedAsset.productClass === "small_part"
    ) {
      throw new Error(
        `Small parts require pack-or-kit traceability for ${rowLabel}. Link a pack or kit asset instead of an individual small-part asset.`,
      );
    }
  }

  await ensureUniqueIndividuallyTrackedUsage(tx, {
    mainAssetId: input.mainAssetId,
    usages: input.resolvedUsages,
  });

  const requiredTokens = parseRequiredTokens(input.policy.includedKitDefinition);
  if (requiredTokens.length === 0) {
    return;
  }

  const seenTokens = new Set<string>();
  for (const usage of input.resolvedUsages) {
    for (const token of usageTokens(usage)) {
      seenTokens.add(token);
    }
  }

  const missing = requiredTokens.filter((token) => !seenTokens.has(token));
  if (missing.length > 0) {
    throw new Error(
      `Required install kit scans are missing: ${missing.join(", ")}.`,
    );
  }
}

export function toJobPartUsageCreateManyInput(input: {
  mainAssetId: string;
  installationJobId?: string | null;
  ticketId?: string | null;
  linkedByUserId: string;
  resolvedUsages: ResolvedPartUsage[];
}): Prisma.JobPartUsageCreateManyInput[] {
  return input.resolvedUsages.map((usage) => ({
    installationJobId: input.installationJobId ?? null,
    ticketId: input.ticketId ?? null,
    mainAssetId: input.mainAssetId,
    usedAssetId: usage.usedAsset.id,
    usedTagId: usage.usedTag?.id ?? null,
    usageType: usage.input.usageType,
    quantity: usage.input.quantity,
    linkedByUserId: input.linkedByUserId,
    linkedAt: new Date(),
    metadata: {
      assetCode: usage.input.assetCode ?? usage.usedAsset.publicCode,
      tagCode: usage.input.tagCode ?? usage.usedTag?.publicCode ?? null,
      partName: usage.input.partName,
      partNumber: usage.input.partNumber,
      catalogPartId: usage.input.catalogPartId,
      unitCost: usage.input.unitCost,
      note: usage.input.note,
      usedAssetClass: usage.usedAsset.productClass,
      usedAssetPublicCode: usage.usedAsset.publicCode,
      usedAssetSerialNumber: usage.usedAsset.serialNumber,
    } satisfies Prisma.InputJsonValue,
  }));
}

function derivePartName(usage: ResolvedPartUsage): string {
  if (usage.input.partName) {
    return usage.input.partName;
  }

  const metadata = asRecord(usage.usedAsset.metadata);
  return (
    asString(metadata.partName) ??
    asString(metadata.name) ??
    asString(metadata.itemDescription) ??
    usage.usedAsset.publicCode
  );
}

function derivePartNumber(usage: ResolvedPartUsage): string {
  if (usage.input.partNumber) {
    return usage.input.partNumber;
  }

  const metadata = asRecord(usage.usedAsset.metadata);
  return (
    asString(metadata.partNumber) ??
    asString(metadata.partCode) ??
    asString(metadata.itemCode) ??
    ""
  );
}

export function toTicketPartsSnapshot(usages: ResolvedPartUsage[]) {
  const rows = usages.map((usage) => {
    const unitCost = usage.input.unitCost ?? 0;
    return {
      partName: derivePartName(usage),
      partNumber: derivePartNumber(usage),
      usageType: usage.input.usageType,
      quantity: usage.input.quantity,
      cost: Number(unitCost.toFixed(2)),
      lineTotal: Number((unitCost * usage.input.quantity).toFixed(2)),
      assetCode: usage.usedAsset.publicCode,
      tagCode: usage.usedTag?.publicCode ?? null,
    };
  });

  const partsCost = rows.reduce((sum, row) => sum + row.lineTotal, 0);

  return {
    partsUsedJson: rows as unknown as Prisma.InputJsonValue,
    partsCost: Number(partsCost.toFixed(2)),
  };
}

export function mainAssetLookupCodes(input: {
  serialNumber: string | null;
  publicCode?: string | null;
}): Set<string> {
  const result = new Set<string>();
  const serial = toCanonicalCode(input.serialNumber);
  if (serial) {
    result.add(serial);
  }

  const publicCode = toCanonicalCode(input.publicCode ?? null);
  if (publicCode) {
    result.add(publicCode);
  }

  return result;
}

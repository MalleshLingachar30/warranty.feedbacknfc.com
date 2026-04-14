type QuerySource =
  | URLSearchParams
  | {
      get: (key: string) => string | null;
    }
  | Record<string, string | string[] | undefined>;

const PART_SCAN_ASSET_CLASSES = ["spare_part", "small_part", "kit", "pack"] as const;
const PART_SCAN_TAG_CLASSES = [
  "component_unit",
  "small_part_batch",
  "kit_parent",
  "pack_parent",
] as const;

export type PartScanAssetClass = (typeof PART_SCAN_ASSET_CLASSES)[number];
export type PartScanTagClass = (typeof PART_SCAN_TAG_CLASSES)[number];

export type PartScanPayload = {
  assetCode: string;
  tagCode: string;
  assetClass: PartScanAssetClass;
  tagClass: PartScanTagClass;
  organizationId: string;
  partName: string | null;
  partNumber: string | null;
  batchCode: string | null;
  resolverCode: string | null;
};

export type PartScanContext = {
  ticketId: string | null;
  installationJobId: string | null;
  stickerNumber: number | null;
};

export type PartScanParseResult = {
  scan: PartScanPayload | null;
  context: PartScanContext;
  error: string | null;
};

function firstQueryValue(source: QuerySource, key: string): string | null {
  if ("get" in source && typeof source.get === "function") {
    return source.get(key);
  }

  const value = (source as Record<string, string | string[] | undefined>)[key];
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstString = value.find((entry) => typeof entry === "string");
    return firstString ?? null;
  }

  return null;
}

function asNonEmptyString(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStickerNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isSupportedAssetClass(value: string): value is PartScanAssetClass {
  return PART_SCAN_ASSET_CLASSES.includes(value as PartScanAssetClass);
}

function isSupportedTagClass(value: string): value is PartScanTagClass {
  return PART_SCAN_TAG_CLASSES.includes(value as PartScanTagClass);
}

export function parsePartScanFromQuery(source: QuerySource): PartScanParseResult {
  const context: PartScanContext = {
    ticketId: asNonEmptyString(firstQueryValue(source, "ticket")),
    installationJobId: asNonEmptyString(firstQueryValue(source, "job")),
    stickerNumber: parseStickerNumber(firstQueryValue(source, "sticker")),
  };

  const rawAssetCode = asNonEmptyString(firstQueryValue(source, "scanAsset"));
  const rawTagCode = asNonEmptyString(firstQueryValue(source, "scanTag"));
  const rawAssetClass = asNonEmptyString(firstQueryValue(source, "scanAssetClass"));
  const rawTagClass = asNonEmptyString(firstQueryValue(source, "scanTagClass"));
  const rawOrgId = asNonEmptyString(firstQueryValue(source, "scanOrg"));

  const hasScanEnvelope = Boolean(
    rawAssetCode || rawTagCode || rawAssetClass || rawTagClass || rawOrgId,
  );

  if (!hasScanEnvelope) {
    return {
      scan: null,
      context,
      error: null,
    };
  }

  if (!rawAssetCode && !rawTagCode) {
    return {
      scan: null,
      context,
      error:
        "The scanned tag did not include a usable part asset/tag code. Scan the part label again.",
    };
  }

  if (!rawAssetClass || !isSupportedAssetClass(rawAssetClass)) {
    return {
      scan: null,
      context,
      error:
        "Unsupported part class from this scan. Only spare, small-part, kit, or pack assets can be linked.",
    };
  }

  if (!rawTagClass || !isSupportedTagClass(rawTagClass)) {
    return {
      scan: null,
      context,
      error:
        "Unsupported tag class for part usage. Scan a component/small-part/kit/pack generated tag.",
    };
  }

  if (!rawOrgId) {
    return {
      scan: null,
      context,
      error:
        "The scanned part tag is missing owning manufacturer metadata. Re-scan using the generated /r/{code} link.",
    };
  }

  return {
    scan: {
      assetCode: rawAssetCode ?? "",
      tagCode: rawTagCode ?? "",
      assetClass: rawAssetClass,
      tagClass: rawTagClass,
      organizationId: rawOrgId,
      partName: asNonEmptyString(firstQueryValue(source, "scanPartName")),
      partNumber: asNonEmptyString(firstQueryValue(source, "scanPartNumber")),
      batchCode: asNonEmptyString(firstQueryValue(source, "scanBatch")),
      resolverCode: asNonEmptyString(firstQueryValue(source, "scanCode")),
    },
    context,
    error: null,
  };
}

export function buildPartScanQueryString(input: {
  scan: PartScanPayload;
  context?: Partial<PartScanContext>;
}): string {
  const params = new URLSearchParams();
  params.set("scanAsset", input.scan.assetCode);
  params.set("scanTag", input.scan.tagCode);
  params.set("scanAssetClass", input.scan.assetClass);
  params.set("scanTagClass", input.scan.tagClass);
  params.set("scanOrg", input.scan.organizationId);

  if (input.scan.partName) {
    params.set("scanPartName", input.scan.partName);
  }
  if (input.scan.partNumber) {
    params.set("scanPartNumber", input.scan.partNumber);
  }
  if (input.scan.batchCode) {
    params.set("scanBatch", input.scan.batchCode);
  }
  if (input.scan.resolverCode) {
    params.set("scanCode", input.scan.resolverCode);
  }

  if (input.context?.ticketId) {
    params.set("ticket", input.context.ticketId);
  }
  if (input.context?.installationJobId) {
    params.set("job", input.context.installationJobId);
  }
  if (typeof input.context?.stickerNumber === "number") {
    params.set("sticker", String(input.context.stickerNumber));
  }

  return params.toString();
}

export function partScanSignature(scan: PartScanPayload): string {
  return [
    scan.organizationId,
    scan.assetCode,
    scan.tagCode,
    scan.assetClass,
    scan.tagClass,
  ].join(":");
}

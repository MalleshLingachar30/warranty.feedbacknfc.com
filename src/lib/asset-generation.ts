import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";

export const ASSET_PRODUCT_CLASSES = [
  "main_product",
  "spare_part",
  "small_part",
  "kit",
  "pack",
] as const;
export type AssetProductClass = (typeof ASSET_PRODUCT_CLASSES)[number];

export const TAG_CLASSES = [
  "unit_service",
  "carton_registration",
  "component_unit",
  "small_part_batch",
  "kit_parent",
  "pack_parent",
] as const;
export type TagClass = (typeof TAG_CLASSES)[number];

export const TAG_SYMBOLOGIES = ["qr", "data_matrix", "nfc_uri"] as const;
export type TagSymbology = (typeof TAG_SYMBOLOGIES)[number];

export const TAG_OUTPUT_FORMATS = ["standard", "pcb_micro_dm"] as const;
export type TagOutputFormat = (typeof TAG_OUTPUT_FORMATS)[number];

export const TAG_MATERIAL_VARIANTS = [
  "standard",
  "high_temp",
  "premium",
] as const;
export type TagMaterialVariant = (typeof TAG_MATERIAL_VARIANTS)[number];

export const TAG_VIEWER_POLICIES = [
  "public",
  "owner_only",
  "technician_admin",
  "warehouse_admin",
] as const;
export type TagViewerPolicy = (typeof TAG_VIEWER_POLICIES)[number];

export function asAssetProductClass(value: unknown): AssetProductClass | null {
  if (
    typeof value === "string" &&
    (ASSET_PRODUCT_CLASSES as readonly string[]).includes(value)
  ) {
    return value as AssetProductClass;
  }

  return null;
}

export function asTagSymbology(value: unknown): TagSymbology | null {
  if (
    typeof value === "string" &&
    (TAG_SYMBOLOGIES as readonly string[]).includes(value)
  ) {
    return value as TagSymbology;
  }

  return null;
}

export function asTagOutputFormat(value: unknown): TagOutputFormat | null {
  if (
    typeof value === "string" &&
    (TAG_OUTPUT_FORMATS as readonly string[]).includes(value)
  ) {
    return value as TagOutputFormat;
  }

  return null;
}

export function asTagMaterialVariant(value: unknown): TagMaterialVariant | null {
  if (
    typeof value === "string" &&
    (TAG_MATERIAL_VARIANTS as readonly string[]).includes(value)
  ) {
    return value as TagMaterialVariant;
  }

  return null;
}

export function asTagViewerPolicy(value: unknown): TagViewerPolicy | null {
  if (
    typeof value === "string" &&
    (TAG_VIEWER_POLICIES as readonly string[]).includes(value)
  ) {
    return value as TagViewerPolicy;
  }

  return null;
}

export function tagClassForProductClass(productClass: AssetProductClass): TagClass {
  if (productClass === "main_product") {
    return "unit_service";
  }

  if (productClass === "spare_part") {
    return "component_unit";
  }

  if (productClass === "small_part") {
    return "small_part_batch";
  }

  if (productClass === "kit") {
    return "kit_parent";
  }

  return "pack_parent";
}

type PolicyInputs = {
  productClass: AssetProductClass;
  activationMode: "plug_and_play" | "installation_driven";
  partTraceabilityMode: "none" | "pack_or_kit" | "unit_scan_mandatory";
  smallPartTrackingMode: "individual" | "pack_level" | "kit_level" | "pack_or_kit";
};

export function recommendedSymbologiesFromPolicy(
  input: PolicyInputs,
): TagSymbology[] {
  if (input.productClass === "main_product") {
    return input.activationMode === "installation_driven"
      ? ["qr", "data_matrix"]
      : ["qr"];
  }

  if (input.productClass === "spare_part") {
    return input.partTraceabilityMode === "unit_scan_mandatory"
      ? ["data_matrix"]
      : ["qr", "data_matrix"];
  }

  if (input.productClass === "small_part") {
    return input.smallPartTrackingMode === "individual"
      ? ["data_matrix"]
      : ["data_matrix", "nfc_uri"];
  }

  return ["data_matrix"];
}

export function formatTagGenerationBatchCode(id: string, createdAt: Date): string {
  const y = createdAt.getFullYear().toString();
  const m = String(createdAt.getMonth() + 1).padStart(2, "0");
  const d = String(createdAt.getDate()).padStart(2, "0");
  return `BATCH-${y}${m}${d}-${id.slice(0, 8).toUpperCase()}`;
}

export function formatSerialNumber(input: {
  prefix: string;
  start: number;
  offset: number;
  padLength: number;
}) {
  return `${input.prefix}${String(input.start + input.offset).padStart(
    input.padLength,
    "0",
  )}`;
}

function compactUuid(value: string) {
  return value.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function symbologyShortCode(symbology: TagSymbology) {
  if (symbology === "data_matrix") {
    return "DM";
  }

  if (symbology === "nfc_uri") {
    return "NFC";
  }

  return "QR";
}

function tagClassShortCode(tagClass: TagClass) {
  if (tagClass === "unit_service") {
    return "UNIT";
  }
  if (tagClass === "carton_registration") {
    return "CARTON";
  }
  if (tagClass === "component_unit") {
    return "COMP";
  }
  if (tagClass === "small_part_batch") {
    return "SPART";
  }
  if (tagClass === "kit_parent") {
    return "KIT";
  }
  return "PACK";
}

const MICRO_RESOLVER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function encodeMicroResolverValue(value: bigint, length: number) {
  const alphabetLength = BigInt(MICRO_RESOLVER_ALPHABET.length);
  let remaining = value;
  let output = "";

  for (let index = 0; index < length; index += 1) {
    const alphabetIndex = Number(remaining % alphabetLength);
    output = `${MICRO_RESOLVER_ALPHABET[alphabetIndex] ?? "A"}${output}`;
    remaining /= alphabetLength;
  }

  return output;
}

export function buildMicroResolverCode(input: {
  batchId: string;
  offset: number;
  symbology: TagSymbology;
}) {
  const compactBatchId = input.batchId.replace(/-/g, "").toUpperCase();
  const leadingBits = BigInt(`0x${compactBatchId.slice(0, 10)}`);
  const trailingBits = BigInt(`0x${compactBatchId.slice(-10)}`);
  const symbologyBits =
    input.symbology === "data_matrix"
      ? BigInt(0x444d)
      : input.symbology === "nfc_uri"
        ? BigInt(0x4e4643)
        : BigInt(0x5152);
  const sequenceBits = BigInt(input.offset + 1);
  const mixed =
    (leadingBits ^
      trailingBits ^
      symbologyBits ^
      sequenceBits * BigInt(0x9e3779b1) ^
      (sequenceBits << BigInt(11))) &
    ((BigInt(1) << BigInt(40)) - BigInt(1));

  return encodeMicroResolverValue(mixed, 8);
}

export function buildAssetPublicCode(batchId: string, offset: number) {
  return `AST-${compactUuid(batchId)}-${String(offset + 1).padStart(6, "0")}`;
}

export function buildTagPublicCode(input: {
  batchId: string;
  offset: number;
  tagClass: TagClass;
  symbology: TagSymbology;
}) {
  return `TAG-${compactUuid(input.batchId)}-${String(input.offset + 1).padStart(
    6,
    "0",
  )}-${tagClassShortCode(input.tagClass)}-${symbologyShortCode(input.symbology)}`;
}

export function buildTagEncodedValue(input: {
  tagPublicCode: string;
  symbology: TagSymbology;
  outputFormat?: TagOutputFormat;
  microResolverCode?: string | null;
}) {
  if (
    input.outputFormat === "pcb_micro_dm" &&
    input.symbology === "data_matrix" &&
    input.microResolverCode
  ) {
    return input.microResolverCode;
  }

  const suffix = input.symbology === "nfc_uri" ? "?src=nfc" : "";
  return buildAbsoluteWarrantyUrl(
    `/r/${encodeURIComponent(input.tagPublicCode)}${suffix}`,
  );
}

export function formatProductClassLabel(productClass: AssetProductClass) {
  if (productClass === "main_product") {
    return "Main Product";
  }
  if (productClass === "spare_part") {
    return "Spare Part";
  }
  if (productClass === "small_part") {
    return "Small Part";
  }
  if (productClass === "kit") {
    return "Kit";
  }
  return "Pack";
}

export function formatSymbologyLabel(symbology: TagSymbology) {
  if (symbology === "data_matrix") {
    return "Data Matrix";
  }
  if (symbology === "nfc_uri") {
    return "NFC URI";
  }
  return "QR";
}

export function formatTagOutputFormatLabel(format: TagOutputFormat) {
  if (format === "pcb_micro_dm") {
    return "PCB Micro Data Matrix";
  }

  return "Standard";
}

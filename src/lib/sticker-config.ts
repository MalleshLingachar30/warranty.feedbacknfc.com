export const STICKER_MODES = ["qr_only", "nfc_qr", "nfc_only"] as const;

export type StickerMode = (typeof STICKER_MODES)[number];

export const STICKER_REGIONAL_LANGUAGES = ["hi", "ar"] as const;
export type StickerRegionalLanguage =
  (typeof STICKER_REGIONAL_LANGUAGES)[number];

export type StickerBrandingConfig = {
  primaryColor: string;
  logoUrl: string;
  showLogoInQrCenter: boolean;
  qrLogoScalePercent: number;
  instructionTextEn: string;
  instructionTextHi: string;
  instructionTextAr: string;
  regionalLanguage: StickerRegionalLanguage;
  showSupportPhone: boolean;
  supportPhone: string;
};

export type ManufacturerStickerConfig = {
  mode: StickerMode;
  urlBase: string;
  branding: StickerBrandingConfig;
};

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  if (normalized < 0) {
    return null;
  }

  return normalized;
}

function normalizeMode(value: unknown): StickerMode {
  const candidate = asString(value)?.toLowerCase();
  if (
    candidate === "qr_only" ||
    candidate === "nfc_qr" ||
    candidate === "nfc_only"
  ) {
    return candidate;
  }

  return "qr_only";
}

function normalizeRegionalLanguage(value: unknown): StickerRegionalLanguage {
  const candidate = asString(value)?.toLowerCase();
  if (candidate === "ar") {
    return "ar";
  }

  return "hi";
}

function normalizeUrlBase(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    return "warranty.feedbacknfc.com";
  }

  const trimmed = raw.replace(/\/+$/, "");

  try {
    if (trimmed.includes("://")) {
      const url = new URL(trimmed);
      return url.host;
    }
  } catch {
    // Ignore URL parsing failures and fall back to best-effort normalization.
  }

  return trimmed.replace(/^https?:\/\//i, "");
}

function normalizeBranding(value: unknown): StickerBrandingConfig {
  const source = isRecord(value) ? value : {};

  return {
    primaryColor:
      asString(source.primary_color ?? source.primaryColor) ?? "#0066CC",
    logoUrl: asString(source.logo_url ?? source.logoUrl) ?? "",
    showLogoInQrCenter:
      asBoolean(source.show_logo_in_qr_center ?? source.showLogoInQrCenter) ??
      false,
    qrLogoScalePercent: Math.min(
      30,
      Math.max(
        10,
        asPositiveInteger(
          source.qr_logo_scale_percent ?? source.qrLogoScalePercent,
        ) ?? 18,
      ),
    ),
    instructionTextEn:
      asString(source.instruction_text_en ?? source.instructionTextEn) ??
      "Scan for Warranty Service",
    instructionTextHi:
      asString(source.instruction_text_hi ?? source.instructionTextHi) ??
      "वारंटी सेवा के लिए स्कैन करें",
    instructionTextAr:
      asString(source.instruction_text_ar ?? source.instructionTextAr) ??
      "امسح للحصول على خدمة الضمان",
    regionalLanguage: normalizeRegionalLanguage(
      source.regional_language ?? source.regionalLanguage,
    ),
    showSupportPhone:
      asBoolean(source.show_support_phone ?? source.showSupportPhone) ?? true,
    supportPhone: asString(source.support_phone ?? source.supportPhone) ?? "",
  };
}

export function normalizeManufacturerStickerConfig(
  settings: unknown,
): ManufacturerStickerConfig {
  const source = isRecord(settings) ? settings : {};

  const mode = normalizeMode(source.sticker_mode ?? source.stickerMode);
  const urlBase = normalizeUrlBase(
    source.sticker_url_base ?? source.stickerUrlBase,
  );
  const branding = normalizeBranding(
    source.sticker_branding ?? source.stickerBranding,
  );

  return {
    mode,
    urlBase,
    branding,
  };
}

export function stickerConfigToOrganizationSettingsPatch(
  config: ManufacturerStickerConfig,
): Record<string, unknown> {
  return {
    sticker_mode: config.mode,
    sticker_url_base: config.urlBase,
    sticker_branding: {
      primary_color: config.branding.primaryColor,
      logo_url: config.branding.logoUrl,
      show_logo_in_qr_center: config.branding.showLogoInQrCenter,
      qr_logo_scale_percent: config.branding.qrLogoScalePercent,
      instruction_text_en: config.branding.instructionTextEn,
      instruction_text_hi: config.branding.instructionTextHi,
      instruction_text_ar: config.branding.instructionTextAr,
      regional_language: config.branding.regionalLanguage,
      show_support_phone: config.branding.showSupportPhone,
      support_phone: config.branding.supportPhone,
    },
  };
}

export function toStickerPublicBaseUrl(urlBase: string): string {
  const normalized = normalizeUrlBase(urlBase);
  return `https://${normalized}`;
}

export function buildStickerPublicUrl(input: {
  urlBase: string;
  stickerNumber: number;
  source?: "qr" | "nfc";
}): string {
  const base = toStickerPublicBaseUrl(input.urlBase);
  const sourceSuffix = input.source ? `?src=${input.source}` : "";
  return `${base}/nfc/${input.stickerNumber}${sourceSuffix}`;
}

export const MOBILE_CODE_SCANNER_FORMATS = ["qr_code", "data_matrix"] as const;

export type MobileCodeScannerFormat = (typeof MOBILE_CODE_SCANNER_FORMATS)[number];

export type MobileCodeScannerSource =
  | "native_barcode_detector"
  | "zxing_wasm"
  | "manual_entry";

export type MobileCodeScannerResult = {
  value: string;
  rawValue: string;
  format: string | null;
  source: MobileCodeScannerSource;
};

type BarcodeDetectorLike = {
  detect: (
    source:
      | HTMLVideoElement
      | HTMLCanvasElement
      | ImageBitmap
      | ImageData
      | OffscreenCanvas,
  ) => Promise<Array<{ rawValue?: string; format?: string }>>;
};

type BarcodeDetectorConstructorLike = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

const URL_PATH_PREFIXES = new Set(["r", "nfc", "q", "c"]);

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructorLike | null {
  const candidate = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;

  if (!candidate) {
    return null;
  }

  return candidate as BarcodeDetectorConstructorLike;
}

function extractCodeFromUrlPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length < 2 || !URL_PATH_PREFIXES.has(segments[0] ?? "")) {
    return null;
  }

  return decodeURIComponent(segments[1] ?? "");
}

export function normalizeScannedValue(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    try {
      const parsedUrl = trimmed.startsWith("/")
        ? new URL(trimmed, "https://scanner.feedbacknfc.local")
        : new URL(trimmed);
      const extractedCode = extractCodeFromUrlPathname(parsedUrl.pathname);

      return extractedCode?.trim() || trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function createManualScanResult(rawValue: string): MobileCodeScannerResult | null {
  const normalizedValue = normalizeScannedValue(rawValue);

  if (!normalizedValue) {
    return null;
  }

  return {
    value: normalizedValue,
    rawValue,
    format: null,
    source: "manual_entry",
  };
}

export async function createNativeBarcodeDetector(
  formats: MobileCodeScannerFormat[],
): Promise<BarcodeDetectorLike | null> {
  const BarcodeDetectorCtor = getBarcodeDetectorConstructor();

  if (!BarcodeDetectorCtor) {
    return null;
  }

  const requestedFormats = formats.map((format) => format);
  const supportedFormats = await BarcodeDetectorCtor.getSupportedFormats?.();

  if (
    supportedFormats &&
    requestedFormats.some((format) => !supportedFormats.includes(format))
  ) {
    return null;
  }

  return new BarcodeDetectorCtor({
    formats: requestedFormats,
  });
}

export function zxingFormatsForScanner(formats: MobileCodeScannerFormat[]) {
  return formats.map((format) => {
    if (format === "data_matrix") {
      return "DataMatrix";
    }

    return "QRCode";
  });
}

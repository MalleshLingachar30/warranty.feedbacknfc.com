function parsePositiveStickerNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function toUrlCandidate(value: string): string | null {
  if (!value.includes("/")) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null;
  }

  return `https://${value}`;
}

export function parseStickerNumber(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = parsePositiveStickerNumber(trimmed);
  if (directMatch !== null) {
    return directMatch;
  }

  const urlCandidate = toUrlCandidate(trimmed);
  if (!urlCandidate) {
    return null;
  }

  try {
    const parsedUrl = new URL(urlCandidate);
    const segments = parsedUrl.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    const nfcSegmentIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "nfc",
    );

    if (nfcSegmentIndex < 0) {
      return null;
    }

    return parsePositiveStickerNumber(segments[nfcSegmentIndex + 1] ?? "");
  } catch {
    return null;
  }
}

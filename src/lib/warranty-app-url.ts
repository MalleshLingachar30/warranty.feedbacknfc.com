export function getWarrantyAppBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_WARRANTY_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://warranty.feedbacknfc.com";

  return explicit.replace(/\/+$/, "");
}

export function buildAbsoluteWarrantyUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getWarrantyAppBaseUrl()}${normalizedPath}`;
}

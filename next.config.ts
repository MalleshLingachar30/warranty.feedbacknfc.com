import type { NextConfig } from "next";

const canonicalWarrantyAppUrl = (
  process.env.NEXT_PUBLIC_WARRANTY_APP_URL ??
  "https://warranty.feedbacknfc.com"
).replace(/\/+$/, "");

const canonicalWarrantyHost = (() => {
  try {
    return new URL(canonicalWarrantyAppUrl).hostname;
  } catch {
    return "warranty.feedbacknfc.com";
  }
})();

const rootStickerHosts = ["feedbacknfc.com", "www.feedbacknfc.com"].filter(
  (host) => host !== canonicalWarrantyHost,
);

const nextConfig: NextConfig = {
  async redirects() {
    return rootStickerHosts.map((host) => ({
      source: "/nfc/:path*",
      has: [{ type: "host", value: host }],
      destination: `${canonicalWarrantyAppUrl}/nfc/:path*`,
      permanent: true,
    }));
  },
};

export default nextConfig;

import QRCode from "qrcode";

import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const stickerNumber = Number.parseInt(number, 10);

  if (!Number.isFinite(stickerNumber) || stickerNumber <= 0) {
    return new Response("Invalid sticker number.", { status: 400 });
  }

  const stickerUrl = buildAbsoluteWarrantyUrl(`/nfc/${stickerNumber}`);
  const qrSvg = await QRCode.toString(stickerUrl, {
    type: "svg",
    width: 220,
    margin: 1,
  });

  return new Response(qrSvg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
    },
  });
}

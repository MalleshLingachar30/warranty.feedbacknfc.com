import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { db } from "@/lib/db";
import { createWarrantyCertificatePdfDocument } from "@/lib/pdf/warranty-certificate-document";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";

export const runtime = "nodejs";

function formatDate(date: Date | null): string {
  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildCertificateNumber(
  warrantyStartDate: Date | null,
  stickerNumber: number,
): string {
  const year = (warrantyStartDate ?? new Date()).getFullYear();
  return `WRC-${year}-${String(stickerNumber).padStart(6, "0")}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return new Response("Product id is required.", { status: 400 });
  }

  const product = await db.product.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      serialNumber: true,
      customerName: true,
      warrantyStartDate: true,
      warrantyEndDate: true,
      productModel: {
        select: {
          name: true,
          modelNumber: true,
        },
      },
      organization: {
        select: {
          name: true,
          logoUrl: true,
        },
      },
      sticker: {
        select: {
          stickerNumber: true,
          type: true,
        },
      },
    },
  });

  if (!product) {
    return new Response("Product not found.", { status: 404 });
  }

  const certificateNumber = buildCertificateNumber(
    product.warrantyStartDate,
    product.sticker.stickerNumber,
  );
  const nfcUrl = buildAbsoluteWarrantyUrl(`/nfc/${product.sticker.stickerNumber}`);
  const qrDataUrl = await QRCode.toDataURL(nfcUrl, {
    margin: 1,
    width: 240,
  });
  const documentElement = createWarrantyCertificatePdfDocument({
    certificateNumber,
    organizationName: product.organization.name,
    organizationLogoUrl: product.organization.logoUrl,
    productName: product.productModel.name,
    modelNumber: product.productModel.modelNumber,
    serialNumber: product.serialNumber,
    customerName: product.customerName,
    warrantyStartDate: formatDate(product.warrantyStartDate),
    warrantyEndDate: formatDate(product.warrantyEndDate),
    stickerNumber: product.sticker.stickerNumber,
    stickerType: product.sticker.type,
    nfcUrl,
    qrDataUrl,
  });

  const pdfBuffer = await renderToBuffer(
    documentElement,
  );

  const url = new URL(request.url);
  const asAttachment =
    url.searchParams.get("download") === "1" ||
    url.searchParams.get("download") === "true";
  const dispositionType = asAttachment ? "attachment" : "inline";
  const safeFileName = `${certificateNumber}.pdf`;

  const responseBody = Uint8Array.from(pdfBuffer).buffer;

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dispositionType}; filename=\"${safeFileName}\"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

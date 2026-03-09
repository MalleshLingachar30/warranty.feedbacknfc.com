import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import QRCode from "qrcode";
import sharp from "sharp";

import { db } from "@/lib/db";
import {
  buildStickerPublicUrl,
  normalizeManufacturerStickerConfig,
} from "@/lib/sticker-config";
import { createStickerSheetPdfDocument } from "@/lib/pdf/sticker-sheet-document";
import { STICKER_FONT_PATHS } from "@/lib/sticker-label-fonts";

import {
  ApiError,
  formatAllocationId,
  jsonError,
  requireManufacturerContext,
} from "../../_utils";

export const runtime = "nodejs";

type OutputFormat = "pdf_sheet" | "png_zip" | "csv";
type ErrorCorrection = "L" | "M" | "Q" | "H";
type QrSizeMm = 25 | 30 | 35;
type QrVariant = "product" | "carton" | "combined";

function normalizeQrDarkColor(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) {
    return "#000000";
  }

  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(candidate)) {
    return candidate;
  }

  return "#000000";
}

function parseOutputFormat(value: string | null): OutputFormat {
  if (value === "pdf_sheet" || value === "png_zip" || value === "csv") {
    return value;
  }

  return "png_zip";
}

function parseErrorCorrection(value: string | null): ErrorCorrection {
  if (value === "L" || value === "M" || value === "Q" || value === "H") {
    return value;
  }

  return "H";
}

function parseQrSizeMm(value: string | null): QrSizeMm {
  if (value === "25") {
    return 25;
  }
  if (value === "35") {
    return 35;
  }

  return 30;
}

function parseQrVariant(value: string | null): QrVariant {
  if (value === "carton" || value === "combined") {
    return value;
  }

  return "product";
}

function toQrPixels(qrSizeMm: QrSizeMm, dpi = 300) {
  const pixels = Math.round((qrSizeMm / 25.4) * dpi);
  return Math.max(180, Math.min(pixels, 1200));
}

function buildStickerSerial(stickerNumber: number) {
  return `FNFC-${String(stickerNumber).padStart(6, "0")}`;
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    return null;
  }

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDownloadTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
}

async function loadLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  if (!logoUrl) {
    return null;
  }

  const inlineBuffer = decodeDataUrl(logoUrl);
  if (inlineBuffer) {
    return inlineBuffer;
  }

  try {
    const response = await fetch(logoUrl);
    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function buildCenterPatchSvg(size: number) {
  const radius = Math.max(6, Math.round(size * 0.16));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/></svg>`,
  );
}

async function composeQrLogoOverlay(input: {
  qrBuffer: Buffer;
  logoBuffer: Buffer;
  qrPixels: number;
  qrLogoScalePercent: number;
}) {
  const logoSize = Math.max(
    24,
    Math.round((input.qrPixels * input.qrLogoScalePercent) / 100),
  );
  const patchSize = Math.min(input.qrPixels - 8, Math.round(logoSize * 1.35));
  const leftPatch = Math.floor((input.qrPixels - patchSize) / 2);
  const topPatch = Math.floor((input.qrPixels - patchSize) / 2);
  const leftLogo = Math.floor((input.qrPixels - logoSize) / 2);
  const topLogo = Math.floor((input.qrPixels - logoSize) / 2);

  const resizedLogo = await sharp(input.logoBuffer)
    .resize({
      width: logoSize,
      height: logoSize,
      fit: "contain",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return sharp(input.qrBuffer)
    .composite([
      {
        input: buildCenterPatchSvg(patchSize),
        left: leftPatch,
        top: topPatch,
      },
      {
        input: resizedLogo,
        left: leftLogo,
        top: topLogo,
      },
    ])
    .png()
    .toBuffer();
}

async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  limit: number,
) {
  const queue = [...tasks];
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      await next();
    }
  });

  await Promise.all(runners);
}

function buildQrLabelSvg(input: { width: number; height: number }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
      <rect x="1" y="1" width="${input.width - 2}" height="${input.height - 2}" rx="18" ry="18" fill="#ffffff" stroke="#dbe4f0" stroke-width="2"/>
    </svg>`,
  );
}

async function buildTextOverlayPng(input: {
  text: string;
  width: number;
  fontSize: number;
  color: string;
  fontWeight?: 400 | 700;
}) {
  const markup = `<span foreground="${escapeXml(input.color)}" font_family="Noto Sans" font_size="${input.fontSize * 1024}" font_weight="${input.fontWeight ?? 400}">${escapeXml(input.text)}</span>`;

  return sharp({
    text: {
      text: markup,
      width: input.width,
      align: "center",
      rgba: true,
      fontfile: STICKER_FONT_PATHS.sans,
    },
  })
    .png()
    .toBuffer();
}

async function composeQrLabelImage(input: {
  qrBuffer: Buffer;
  qrPixels: number;
  primaryInstruction: string;
  domainLabel: string;
  serialLabel?: string | null;
  primaryColor: string;
  logoBuffer?: Buffer | null;
}) {
  const paddingX = 24;
  const topSection = input.serialLabel ? 72 : 58;
  const bottomSection = input.serialLabel ? 52 : 34;
  const width = input.qrPixels + paddingX * 2;
  const height = topSection + input.qrPixels + bottomSection;
  const qrLeft = Math.floor((width - input.qrPixels) / 2);
  const qrTop = topSection;
  const textWidth = width - 24;
  const instructionOverlay = await buildTextOverlayPng({
    text: input.primaryInstruction,
    width: textWidth,
    fontSize: 18,
    color: "#0f172a",
    fontWeight: 700,
  });
  const domainOverlay = await buildTextOverlayPng({
    text: input.domainLabel,
    width: textWidth,
    fontSize: 13,
    color: input.primaryColor,
  });
  const serialOverlay = input.serialLabel
    ? await buildTextOverlayPng({
        text: input.serialLabel,
        width: textWidth,
        fontSize: 18,
        color: "#0f172a",
        fontWeight: 700,
      })
    : null;

  const composites: sharp.OverlayOptions[] = [
    {
      input: buildQrLabelSvg({
        width,
        height,
      }),
    },
    {
      input: input.qrBuffer,
      left: qrLeft,
      top: qrTop,
    },
    {
      input: instructionOverlay,
      left: 12,
      top: input.logoBuffer ? 42 : 18,
    },
    {
      input: domainOverlay,
      left: 12,
      top: height - 22,
    },
  ];

  if (serialOverlay) {
    composites.push({
      input: serialOverlay,
      left: 12,
      top: height - 44,
    });
  }

  if (input.logoBuffer) {
    const logo = await sharp(input.logoBuffer)
      .resize({
        width: 120,
        height: 40,
        fit: "contain",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();

    composites.push({
      input: logo,
      left: Math.floor((width - 120) / 2),
      top: 10,
    });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const url = new URL(request.url);

    const allocationId = url.searchParams.get("allocation_id");
    if (!allocationId) {
      throw new ApiError("allocation_id is required.", 400);
    }

    const format = parseOutputFormat(url.searchParams.get("format"));
    const qrSizeMm = parseQrSizeMm(url.searchParams.get("qr_size_mm"));
    const variant = parseQrVariant(url.searchParams.get("variant"));
    const errorCorrection = parseErrorCorrection(
      url.searchParams.get("error_correction"),
    );

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        logoUrl: true,
        settings: true,
      },
    });

    if (!organization) {
      throw new ApiError("Manufacturer organization not found.", 404);
    }

    const stickerConfig = normalizeManufacturerStickerConfig(
      organization.settings,
    );
    if (stickerConfig.mode === "nfc_only") {
      throw new ApiError(
        "QR generation is disabled while Sticker Technology Mode is set to NFC Only.",
        400,
      );
    }
    const qrDarkColor = normalizeQrDarkColor(
      stickerConfig.branding.primaryColor,
    );
    const logoUrl =
      stickerConfig.branding.logoUrl || organization.logoUrl || "";

    const allocation = await db.stickerAllocation.findFirst({
      where: {
        id: allocationId,
        organizationId,
      },
      select: {
        id: true,
        allocatedAt: true,
        stickerStartNumber: true,
        stickerEndNumber: true,
        totalCount: true,
        includeCartonQr: true,
      },
    });

    if (!allocation) {
      throw new ApiError("Allocation not found.", 404);
    }

    if (variant !== "product" && !allocation.includeCartonQr) {
      throw new ApiError(
        "This allocation was created without carton QR labels.",
        400,
      );
    }

    const start = allocation.stickerStartNumber;
    const end = allocation.stickerEndNumber;

    const stickers = await db.sticker.findMany({
      where: {
        allocatedToOrgId: organizationId,
        stickerNumber: {
          gte: start,
          lte: end,
        },
      },
      select: {
        stickerNumber: true,
        stickerSerial: true,
      },
      orderBy: {
        stickerNumber: "asc",
      },
    });

    const serialByNumber = new Map(
      stickers.map((sticker) => [sticker.stickerNumber, sticker.stickerSerial]),
    );

    const stickerItems = Array.from({ length: end - start + 1 }, (_, index) => {
      const stickerNumber = start + index;
      const serial =
        serialByNumber.get(stickerNumber) ?? buildStickerSerial(stickerNumber);
      const productUrl = buildStickerPublicUrl({
        urlBase: stickerConfig.urlBase,
        stickerNumber,
        context: "product",
      });
      const cartonUrl = buildStickerPublicUrl({
        urlBase: stickerConfig.urlBase,
        stickerNumber,
        context: "carton",
      });
      return {
        stickerNumber,
        serial,
        productUrl,
        cartonUrl,
        url: variant === "carton" ? cartonUrl : productUrl,
      };
    });

    const allocationLabel = formatAllocationId(
      allocation.id,
      allocation.allocatedAt,
    );
    const generatedAt = new Date();
    const timestampLabel = buildDownloadTimestamp(generatedAt);

    if (format === "csv") {
      const lines =
        variant === "combined"
          ? ["sticker_number,serial,product_qr_url,carton_qr_url"]
          : variant === "carton"
            ? ["sticker_number,serial,carton_qr_url"]
            : ["sticker_number,serial,product_qr_url"];
      for (const item of stickerItems) {
        if (variant === "combined") {
          lines.push(
            `${item.stickerNumber},${item.serial},${item.productUrl},${item.cartonUrl}`,
          );
          continue;
        }

        if (variant === "carton") {
          lines.push(`${item.stickerNumber},${item.serial},${item.cartonUrl}`);
          continue;
        }

        lines.push(`${item.stickerNumber},${item.serial},${item.productUrl}`);
      }

      const body = `${lines.join("\n")}\n`;

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${allocationLabel}-${variant}-qr-${timestampLabel}.csv\"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "png_zip") {
      const zip = new JSZip();
      const qrPixels = toQrPixels(qrSizeMm);
      const logoBuffer =
        stickerConfig.branding.showLogoInQrCenter && logoUrl
          ? await loadLogoBuffer(logoUrl)
          : null;

      const tasks = stickerItems.map((item) => async () => {
        const baseQrBuffer = await QRCode.toBuffer(item.url, {
          type: "png",
          width: qrPixels,
          margin: 1,
          errorCorrectionLevel: errorCorrection,
          color: {
            dark: qrDarkColor,
            light: "#FFFFFF",
          },
        });
        const pngBuffer = logoBuffer
          ? await composeQrLogoOverlay({
              qrBuffer: baseQrBuffer,
              logoBuffer,
              qrPixels,
              qrLogoScalePercent: stickerConfig.branding.qrLogoScalePercent,
            })
          : baseQrBuffer;
        const labeledBuffer = await composeQrLabelImage({
          qrBuffer: pngBuffer,
          qrPixels,
          primaryInstruction:
            variant === "carton"
              ? "Activate Warranty Now"
              : stickerConfig.branding.instructionTextEn,
          domainLabel: stickerConfig.urlBase,
          serialLabel: variant === "carton" ? null : item.serial,
          primaryColor: qrDarkColor,
          logoBuffer,
        });

        zip.file(`${variant}-${item.serial}.png`, labeledBuffer, {
          date: generatedAt,
        });
      });

      await runWithConcurrency(tasks, 12);

      const zipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const responseBody = Uint8Array.from(zipBuffer);

      return new Response(responseBody, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename=\"${allocationLabel}-${variant}-qr-pngs-${timestampLabel}.zip\"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const qrPixels = toQrPixels(qrSizeMm);

    const qrTasks: Array<() => Promise<void>> = [];
    const sheetItems: Array<{
      stickerNumber: number;
      stickerSerial: string;
      qrDataUrl: string;
    }> = stickerItems.map((item) => ({
      stickerNumber: item.stickerNumber,
      stickerSerial: item.serial,
      qrDataUrl: "",
    }));

    for (let index = 0; index < stickerItems.length; index += 1) {
      const sticker = stickerItems[index];
      qrTasks.push(async () => {
        const dataUrl = await QRCode.toDataURL(sticker.url, {
          margin: 1,
          width: qrPixels,
          errorCorrectionLevel: errorCorrection,
          color: {
            dark: qrDarkColor,
            light: "#FFFFFF",
          },
        });
        sheetItems[index].qrDataUrl = dataUrl;
      });
    }

    await runWithConcurrency(qrTasks, 12);

    const documentElement = createStickerSheetPdfDocument({
      title:
        variant === "carton"
          ? `${organization.name} • ${allocationLabel} • Carton QR Labels`
          : `${organization.name} • ${allocationLabel} • Product QR Labels`,
      urlBaseLabel: stickerConfig.urlBase,
      qrSizeMm: variant === "carton" ? 25 : qrSizeMm,
      branding: {
        ...stickerConfig.branding,
        logoUrl,
      },
      items: sheetItems,
      labelVariant: variant === "carton" ? "carton" : "product",
      showSerial: variant !== "carton",
      instructionTextEn:
        variant === "carton"
          ? "Activate Warranty Now"
          : stickerConfig.branding.instructionTextEn,
    });

    const pdfBuffer = await renderToBuffer(documentElement);
    const responseBody = Uint8Array.from(pdfBuffer).buffer;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${allocationLabel}-${variant}-qr-sheet-${timestampLabel}.pdf\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

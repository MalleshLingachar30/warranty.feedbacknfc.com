import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import QRCode from "qrcode";

import { db } from "@/lib/db";
import {
  buildStickerPublicUrl,
  normalizeManufacturerStickerConfig,
} from "@/lib/sticker-config";
import { createStickerSheetPdfDocument } from "@/lib/pdf/sticker-sheet-document";

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

function toQrPixels(qrSizeMm: QrSizeMm, dpi = 300) {
  const pixels = Math.round((qrSizeMm / 25.4) * dpi);
  return Math.max(180, Math.min(pixels, 1200));
}

function buildStickerSerial(stickerNumber: number) {
  return `FNFC-${String(stickerNumber).padStart(6, "0")}`;
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
      },
    });

    if (!allocation) {
      throw new ApiError("Allocation not found.", 404);
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
      return {
        stickerNumber,
        serial,
        url: buildStickerPublicUrl({
          urlBase: stickerConfig.urlBase,
          stickerNumber,
          source: "qr",
        }),
      };
    });

    const allocationLabel = formatAllocationId(
      allocation.id,
      allocation.allocatedAt,
    );

    if (format === "csv") {
      const lines = ["sticker_number,serial,url"];
      for (const item of stickerItems) {
        lines.push(`${item.stickerNumber},${item.serial},${item.url}`);
      }

      const body = `${lines.join("\n")}\n`;

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${allocationLabel}-qr.csv\"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    if (format === "png_zip") {
      const zip = new JSZip();
      const qrPixels = toQrPixels(qrSizeMm);

      const tasks = stickerItems.map((item) => async () => {
        const pngBuffer = await QRCode.toBuffer(item.url, {
          type: "png",
          width: qrPixels,
          margin: 1,
          errorCorrectionLevel: errorCorrection,
          color: {
            dark: qrDarkColor,
            light: "#FFFFFF",
          },
        });
        zip.file(`${item.serial}.png`, pngBuffer);
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
          "Content-Disposition": `attachment; filename=\"${allocationLabel}-qr-pngs.zip\"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const qrPixels = toQrPixels(qrSizeMm);
    const logoUrl =
      stickerConfig.branding.logoUrl || organization.logoUrl || "";

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
      title: `${organization.name} • ${allocationLabel}`,
      urlBaseLabel: stickerConfig.urlBase,
      qrSizeMm,
      branding: {
        ...stickerConfig.branding,
        logoUrl,
      },
      items: sheetItems,
    });

    const pdfBuffer = await renderToBuffer(documentElement);
    const responseBody = Uint8Array.from(pdfBuffer).buffer;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${allocationLabel}-qr-sheet.pdf\"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

import JSZip from "jszip";
import QRCode from "qrcode";

import { jsonError, requireManufacturerContext } from "../../../../../_utils";

import { getOwnedBatchExportData } from "../_shared";

export const runtime = "nodejs";

type ExportFormat = "csv" | "png_zip";
type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

function parseFormat(value: string | null): ExportFormat {
  return value === "png_zip" ? "png_zip" : "csv";
}

function parseErrorCorrection(value: string | null): ErrorCorrectionLevel {
  if (value === "L" || value === "M" || value === "Q" || value === "H") {
    return value;
  }

  return "M";
}

function parseQrPixelSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return 420;
  }

  return Math.max(180, Math.min(parsed, 1200));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const { id } = await params;
    const url = new URL(request.url);
    const format = parseFormat(url.searchParams.get("format"));
    const errorCorrectionLevel = parseErrorCorrection(
      url.searchParams.get("error_correction"),
    );
    const qrPixels = parseQrPixelSize(url.searchParams.get("qr_pixels"));

    const { batch, tags } = await getOwnedBatchExportData({
      organizationId,
      batchId: id,
      symbology: "qr",
    });

    if (tags.length === 0) {
      return new Response(
        "tag_code,asset_code,asset_serial,tag_class,encoded_value,print_size_mm\n",
        {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${batch.batchCode}-qr.csv"`,
            "Cache-Control": "private, max-age=60",
          },
        },
      );
    }

    if (format === "csv") {
      const lines = [
        "tag_code,asset_code,asset_serial,tag_class,encoded_value,print_size_mm",
      ];

      for (const tag of tags) {
        lines.push(
          [
            tag.publicCode,
            tag.asset.publicCode,
            tag.asset.serialNumber ?? "",
            tag.tagClass,
            tag.encodedValue,
            tag.printSizeMm ?? "",
          ]
            .map((field) => `"${String(field).replace(/"/g, '""')}"`)
            .join(","),
        );
      }

      return new Response(`${lines.join("\n")}\n`, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${batch.batchCode}-qr.csv"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const zip = new JSZip();
    await Promise.all(
      tags.map(async (tag, index) => {
        const png = await QRCode.toBuffer(tag.encodedValue, {
          errorCorrectionLevel,
          width: qrPixels,
          margin: 2,
        });

        const sequence = String(index + 1).padStart(5, "0");
        const serial = tag.asset.serialNumber ? `-${tag.asset.serialNumber}` : "";
        const fileName = `${sequence}-${tag.publicCode}${serial}.png`;
        zip.file(fileName, png);
      }),
    );

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    const body = new Uint8Array(buffer);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${batch.batchCode}-qr.zip"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

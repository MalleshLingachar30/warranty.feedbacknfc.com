import { db } from "@/lib/db";
import {
  buildStickerPublicUrl,
  normalizeManufacturerStickerConfig,
} from "@/lib/sticker-config";

import {
  ApiError,
  formatAllocationId,
  jsonError,
  requireManufacturerContext,
} from "../../_utils";

export const runtime = "nodejs";

type OutputFormat = "ndef_uri_csv" | "nfc_tools_json";

function parseOutputFormat(value: string | null): OutputFormat {
  if (value === "nfc_tools_json") {
    return "nfc_tools_json";
  }

  return "ndef_uri_csv";
}

function buildStickerSerial(stickerNumber: number) {
  return `FNFC-${String(stickerNumber).padStart(6, "0")}`;
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

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        settings: true,
      },
    });

    if (!organization) {
      throw new ApiError("Manufacturer organization not found.", 404);
    }

    const stickerConfig = normalizeManufacturerStickerConfig(organization.settings);
    if (stickerConfig.mode === "qr_only") {
      throw new ApiError(
        "NFC encoding export is disabled while Sticker Technology Mode is set to QR Code Only.",
        400,
      );
    }

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

    const rows = Array.from({ length: end - start + 1 }, (_, index) => {
      const stickerNumber = start + index;
      const serial = serialByNumber.get(stickerNumber) ?? buildStickerSerial(stickerNumber);
      const ndefUri = buildStickerPublicUrl({
        urlBase: stickerConfig.urlBase,
        stickerNumber,
        source: "nfc",
      });

      return { stickerNumber, serial, ndefUri };
    });

    const allocationLabel = formatAllocationId(allocation.id, allocation.allocatedAt);

    if (format === "nfc_tools_json") {
      return new Response(JSON.stringify(rows, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${allocationLabel}-nfc-tools.json\"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const lines = ["sticker_number,serial,ndef_uri"];
    for (const row of rows) {
      lines.push(`${row.stickerNumber},${row.serial},${row.ndefUri}`);
    }

    const body = `${lines.join("\n")}\n`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${allocationLabel}-nfc-encoding.csv\"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}


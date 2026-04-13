import { jsonError, requireManufacturerContext } from "../../../../../_utils";

import { getOwnedBatchExportData } from "../_shared";

type ExportFormat = "csv" | "json";

function parseFormat(value: string | null): ExportFormat {
  return value === "json" ? "json" : "csv";
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

    const { batch, tags } = await getOwnedBatchExportData({
      organizationId,
      batchId: id,
      symbology: "nfc_uri",
    });

    const rows = tags.map((tag) => ({
      tagCode: tag.publicCode,
      assetCode: tag.asset.publicCode,
      assetSerialNumber: tag.asset.serialNumber,
      ndefUri: tag.encodedValue,
      tagClass: tag.tagClass,
      status: tag.status,
    }));

    if (format === "json") {
      return new Response(JSON.stringify(rows, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${batch.batchCode}-nfc.json"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const lines = ["tag_code,asset_code,asset_serial,ndef_uri,tag_class,status"];
    for (const row of rows) {
      lines.push(
        [
          row.tagCode,
          row.assetCode,
          row.assetSerialNumber ?? "",
          row.ndefUri,
          row.tagClass,
          row.status,
        ]
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(","),
      );
    }

    return new Response(`${lines.join("\n")}\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${batch.batchCode}-nfc.csv"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

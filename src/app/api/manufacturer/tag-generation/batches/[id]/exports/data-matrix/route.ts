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
      symbology: "data_matrix",
    });

    const rows = tags.map((tag) => ({
      tagCode: tag.publicCode,
      assetCode: tag.asset.publicCode,
      assetSerialNumber: tag.asset.serialNumber,
      tagClass: tag.tagClass,
      encodedValue: tag.encodedValue,
      printSizeMm: tag.printSizeMm,
      materialHint:
        tag.printSizeMm && tag.printSizeMm < 8
          ? "Use high-quality direct-part marking or pack/kit-level tagging."
          : "Standard label print profile is acceptable.",
    }));

    if (format === "json") {
      return new Response(
        JSON.stringify(
          {
            batch: {
              id: batch.id,
              batchCode: batch.batchCode,
              productModel: batch.productModel,
              quantity: batch.quantity,
              defaultSymbology: batch.defaultSymbology,
            },
            rows,
          },
          null,
          2,
        ),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${batch.batchCode}-data-matrix.json"`,
            "Cache-Control": "private, max-age=60",
          },
        },
      );
    }

    const lines = [
      "tag_code,asset_code,asset_serial,tag_class,encoded_value,print_size_mm,material_hint",
    ];
    for (const row of rows) {
      lines.push(
        [
          row.tagCode,
          row.assetCode,
          row.assetSerialNumber ?? "",
          row.tagClass,
          row.encodedValue,
          row.printSizeMm ?? "",
          row.materialHint,
        ]
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(","),
      );
    }

    return new Response(`${lines.join("\n")}\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${batch.batchCode}-data-matrix.csv"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

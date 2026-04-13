import { jsonError, requireManufacturerContext } from "../../../../../_utils";

import { getOwnedBatchExportData } from "../_shared";

type ExportFormat = "json" | "csv";

function parseFormat(value: string | null): ExportFormat {
  return value === "csv" ? "csv" : "json";
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
    });

    if (format === "csv") {
      const lines = [
        "tag_code,asset_code,asset_serial,asset_batch_code,product_class,tag_class,symbology,status,encoded_value,print_size_mm",
      ];

      for (const tag of tags) {
        lines.push(
          [
            tag.publicCode,
            tag.asset.publicCode,
            tag.asset.serialNumber ?? "",
            tag.asset.batchCode ?? "",
            tag.asset.productClass,
            tag.tagClass,
            tag.symbology,
            tag.status,
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
          "Content-Disposition": `attachment; filename="${batch.batchCode}-manifest.csv"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    return new Response(
      JSON.stringify(
        {
          batch: {
            id: batch.id,
            batchCode: batch.batchCode,
            createdAt: batch.createdAt,
            quantity: batch.quantity,
            productClass: batch.productClass,
            serialPrefix: batch.serialPrefix,
            serialStart: batch.serialStart,
            serialEnd: batch.serialEnd,
            includeCartonRegistrationTags: batch.includeCartonRegistrationTags,
            defaultSymbology: batch.defaultSymbology,
            outputProfile: batch.outputProfile,
            productModel: batch.productModel,
          },
          tags: tags.map((tag) => ({
            id: tag.id,
            publicCode: tag.publicCode,
            tagClass: tag.tagClass,
            symbology: tag.symbology,
            status: tag.status,
            printSizeMm: tag.printSizeMm,
            encodedValue: tag.encodedValue,
            asset: {
              id: tag.asset.id,
              publicCode: tag.asset.publicCode,
              serialNumber: tag.asset.serialNumber,
              productClass: tag.asset.productClass,
              batchCode: tag.asset.batchCode,
            },
          })),
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${batch.batchCode}-manifest.json"`,
          "Cache-Control": "private, max-age=60",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}

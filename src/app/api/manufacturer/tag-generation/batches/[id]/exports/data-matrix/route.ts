import { jsonError, requireManufacturerContext } from "../../../../../_utils";

import { getOwnedBatchExportData } from "../_shared";
import bwipjs from "bwip-js";

type ExportFormat = "csv" | "json" | "html";

function parseFormat(value: string | null): ExportFormat {
  if (value === "json") {
    return "json";
  }
  if (value === "html") {
    return "html";
  }
  return "csv";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPrintSheet(input: {
  batchCode: string;
  productName: string;
  generatedAt: Date;
  rows: Array<{
    tagCode: string;
    assetCode: string;
    assetSerialNumber: string | null;
    encodedValue: string;
  }>;
}) {
  const labelsHtml = input.rows
    .map((row, index) => {
      const svg = bwipjs.toSVG({
        bcid: "datamatrix",
        text: row.encodedValue,
        scale: 3,
        paddingwidth: 0,
        paddingheight: 0,
      });

      return `
        <article class="label">
          <div class="code">${svg}</div>
          <div class="meta">
            <div class="serial">${escapeHtml(row.assetSerialNumber ?? row.assetCode)}</div>
            <div class="tag">${escapeHtml(row.tagCode)}</div>
            <div class="asset">${escapeHtml(row.assetCode)}</div>
          </div>
          <div class="index">${String(index + 1).padStart(2, "0")}</div>
        </article>
      `;
    })
    .join("");

  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(input.generatedAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.batchCode)} Data Matrix Print Sheet</title>
  <style>
    :root {
      --page-width: 210mm;
      --page-height: 297mm;
      --label-width: 62mm;
      --label-height: 25.2mm;
      --gap: 2mm;
      --border: #0f172a;
      --muted: #475569;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e2e8f0;
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
    }
    .page {
      width: var(--page-width);
      min-height: var(--page-height);
      margin: 0 auto;
      background: white;
      padding: 5mm 6mm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 6mm;
      align-items: end;
      margin-bottom: 4mm;
    }
    .title {
      margin: 0;
      font-size: 16pt;
      font-weight: 700;
    }
    .subtitle {
      margin: 1mm 0 0;
      color: var(--muted);
      font-size: 8pt;
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(3, var(--label-width));
      gap: var(--gap);
    }
    .label {
      position: relative;
      width: var(--label-width);
      height: var(--label-height);
      border: 0.25mm solid var(--border);
      padding: 2.2mm;
      display: grid;
      grid-template-columns: 20mm 1fr;
      gap: 2.5mm;
      overflow: hidden;
      break-inside: avoid;
    }
    .code {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 0.2mm solid #cbd5e1;
      padding-right: 2mm;
    }
    .code svg {
      width: 18mm;
      height: 18mm;
      display: block;
    }
    .meta {
      display: flex;
      min-width: 0;
      flex-direction: column;
      justify-content: center;
      gap: 0.7mm;
    }
    .serial {
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .tag,
    .asset {
      font-size: 5.6pt;
      line-height: 1.2;
      word-break: break-all;
    }
    .index {
      position: absolute;
      top: 1.3mm;
      right: 1.8mm;
      font-size: 6pt;
      color: var(--muted);
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      body { background: white; }
      .page { margin: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div>
        <h1 class="title">${escapeHtml(input.productName)} Data Matrix Sheet</h1>
        <p class="subtitle">Batch ${escapeHtml(input.batchCode)} • ${input.rows.length} serialized spare labels • Generated ${escapeHtml(generatedAt)}</p>
      </div>
      <div class="subtitle">FeedbackNFC Warranty</div>
    </header>
    <section class="sheet">
      ${labelsHtml}
    </section>
  </main>
</body>
</html>`;
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

    if (format === "html") {
      return new Response(
        renderPrintSheet({
          batchCode: batch.batchCode,
          productName: batch.productModel.name,
          generatedAt: batch.createdAt,
          rows,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `inline; filename="${batch.batchCode}-data-matrix-sheet.html"`,
            "Cache-Control": "private, max-age=60",
          },
        },
      );
    }

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

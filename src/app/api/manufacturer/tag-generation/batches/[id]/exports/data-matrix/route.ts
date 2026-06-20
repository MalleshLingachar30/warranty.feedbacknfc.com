import {
  jsonError,
  requireManufacturerWorkspaceContext,
} from "../../../../../_utils";

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

function formatBatchSerialValue(input: {
  serialPrefix: string | null;
  serialNumber: number | string | null;
  padLength?: number | null;
}) {
  if (input.serialNumber == null) {
    return null;
  }

  const prefix = input.serialPrefix ?? "";
  const rawValue = String(input.serialNumber);
  const formattedNumber = input.padLength
    ? rawValue.padStart(input.padLength, "0")
    : rawValue;

  return `${prefix}${formattedNumber}`;
}

function renderPrintSheet(input: {
  batchCode: string;
  productName: string;
  generatedAt: Date;
  outputFormat?: string | null;
  serialFrom?: string | null;
  serialTo?: string | null;
  rows: Array<{
    tagCode: string;
    microResolverCode: string | null;
    assetCode: string;
    assetSerialNumber: string | null;
    encodedValue: string;
  }>;
}) {
  if (input.outputFormat === "pcb_micro_dm") {
    const microLabelsHtml = input.rows
      .map((row) => {
        const svg = bwipjs.toSVG({
          bcid: "datamatrix",
          text: row.encodedValue,
          scale: 2,
          paddingwidth: 0,
          paddingheight: 0,
        });

        return `
          <article class="micro-label" title="${escapeHtml(
            row.microResolverCode ?? row.tagCode,
          )}">
            <div class="micro-code">${svg}</div>
          </article>
        `;
      })
      .join("");

    const generatedAt = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(input.generatedAt);
    const serialRangeLine =
      input.serialFrom && input.serialTo
        ? ` • From ${escapeHtml(input.serialFrom)} • To ${escapeHtml(input.serialTo)}`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.batchCode)} PCB Micro Data Matrix Sheet</title>
  <style>
    :root {
      --page-width: 210mm;
      --page-height: 297mm;
      --label-size: 10mm;
      --gap: 1mm;
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
      padding: 5mm;
    }
    .header {
      margin-bottom: 4mm;
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 4mm;
    }
    .title {
      margin: 0;
      font-size: 13pt;
      font-weight: 700;
    }
    .subtitle {
      margin: 0.7mm 0 0;
      color: #475569;
      font-size: 7pt;
    }
    .micro-sheet {
      display: grid;
      grid-template-columns: repeat(15, var(--label-size));
      gap: var(--gap);
      justify-content: start;
    }
    .micro-label {
      width: var(--label-size);
      height: var(--label-size);
      border: 0.15mm solid #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      break-inside: avoid;
    }
    .micro-code {
      width: 8mm;
      height: 8mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .micro-code svg {
      width: 8mm;
      height: 8mm;
      display: block;
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
        <h1 class="title">${escapeHtml(input.productName)} PCB Micro Data Matrix Sheet</h1>
        <p class="subtitle">Batch ${escapeHtml(input.batchCode)}${serialRangeLine} • ${input.rows.length} labels • 10x10 mm squares • Up to 250 per A4 sheet • Generated ${escapeHtml(generatedAt)}</p>
      </div>
      <div class="subtitle">FeedbackNFC Warranty</div>
    </header>
    <section class="micro-sheet">
      ${microLabelsHtml}
    </section>
  </main>
</body>
</html>`;
  }

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
          <div class="serial">${escapeHtml(row.assetSerialNumber ?? row.assetCode)}</div>
          <div class="code">${svg}</div>
          <div class="meta">
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
  const serialRangeLine =
    input.serialFrom && input.serialTo
      ? ` • From ${escapeHtml(input.serialFrom)} • To ${escapeHtml(input.serialTo)}`
      : "";

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
      --label-width: 31mm;
      --label-height: 33mm;
      --gap: 1.5mm;
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
      padding: 5mm;
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
      grid-template-columns: repeat(6, var(--label-width));
      gap: var(--gap);
    }
    .label {
      position: relative;
      width: var(--label-width);
      height: var(--label-height);
      border: 0.25mm solid var(--border);
      padding: 1.6mm 1.4mm 1.2mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.8mm;
      overflow: hidden;
      break-inside: avoid;
    }
    .serial {
      width: 100%;
      padding-right: 3.4mm;
      text-align: center;
      font-size: 6.2pt;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .code {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 15mm;
    }
    .code svg {
      width: 14mm;
      height: 14mm;
      display: block;
    }
    .meta {
      display: flex;
      width: 100%;
      flex-direction: column;
      align-items: center;
      gap: 0.35mm;
      min-width: 0;
    }
    .tag,
    .asset {
      width: 100%;
      text-align: center;
      font-size: 4pt;
      line-height: 1.1;
      word-break: break-word;
    }
    .index {
      position: absolute;
      top: 0.8mm;
      right: 1.1mm;
      font-size: 4.5pt;
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
        <p class="subtitle">Batch ${escapeHtml(input.batchCode)}${serialRangeLine} • ${input.rows.length} serialized spare labels • Generated ${escapeHtml(generatedAt)}</p>
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
    const { organizationId } = await requireManufacturerWorkspaceContext();
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
      microResolverCode: tag.microResolverCode,
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
    const serialFrom =
      rows[0]?.assetSerialNumber ??
      formatBatchSerialValue({
        serialPrefix: batch.serialPrefix,
        serialNumber: batch.serialStart,
        padLength: batch.outputProfile.serialPadLength,
      });
    const serialTo =
      rows.at(-1)?.assetSerialNumber ??
      formatBatchSerialValue({
        serialPrefix: batch.serialPrefix,
        serialNumber: batch.serialEnd,
        padLength: batch.outputProfile.serialPadLength,
      });

    if (format === "html") {
      return new Response(
        renderPrintSheet({
          batchCode: batch.batchCode,
          productName: batch.productModel.name,
          generatedAt: batch.createdAt,
          outputFormat: batch.outputProfile.format ?? null,
          serialFrom,
          serialTo,
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
      "tag_code,micro_resolver_code,asset_code,asset_serial,tag_class,encoded_value,print_size_mm,material_hint",
    ];
    for (const row of rows) {
      lines.push(
        [
          row.tagCode,
          row.microResolverCode ?? "",
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

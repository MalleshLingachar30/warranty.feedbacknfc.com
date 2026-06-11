import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  applySapItemMasterRow,
  normalizeSapItemMasterRow,
} from "@/lib/integrations/sap-item-master";
import {
  createIntegrationRun,
  createStagingRecord,
  ensureSapConnectorScaffold,
  updateIntegrationRunSummary,
} from "@/lib/integrations/runtime";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../../_utils";

type ItemMasterImportPayload = {
  rows?: unknown;
};

const MAX_IMPORT_ROWS = 5000;

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<ItemMasterImportPayload>(await request.json());

    if (!Array.isArray(body.rows)) {
      throw new ApiError("rows must be an array.", 400);
    }

    const rows = body.rows;

    if (rows.length === 0) {
      throw new ApiError("At least one item master row is required.", 400);
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ApiError(
        `A maximum of ${MAX_IMPORT_ROWS.toLocaleString()} rows can be imported at once.`,
        400,
      );
    }

    const scaffold = await db.$transaction((tx) =>
      ensureSapConnectorScaffold(tx, organizationId),
    );

    const feed = scaffold.feeds.find((entry) => entry.feedType === "item_master");
    if (!feed) {
      throw new ApiError("SAP item master feed is not configured.", 500);
    }

    if (!feed.enabled) {
      throw new ApiError("SAP item master feed is disabled.", 409);
    }

    const run = await db.$transaction((tx) =>
      createIntegrationRun(tx, {
        connectorId: scaffold.connector.id,
        feedId: feed.id,
        organizationId,
        feedType: "item_master",
        metadata: {
          requestedRowCount: rows.length,
        } satisfies Prisma.InputJsonValue,
      }),
    );

    let stagedRowCount = 0;
    let appliedRowCount = 0;
    let failedRowCount = 0;
    let createdProductModelCount = 0;
    const errorSummary: Record<string, number> = {};

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 1;
      const { normalized, errors } = normalizeSapItemMasterRow(row);
      const externalRecordKey = normalized?.externalItemCode ?? null;
      const normalizedPayload = normalized
        ? (normalized as unknown as Prisma.InputJsonValue)
        : null;

      stagedRowCount += 1;

      if (errors.length > 0 || !normalized) {
        failedRowCount += 1;
        errorSummary.validation_error =
          (errorSummary.validation_error ?? 0) + 1;

        await db.$transaction((tx) =>
          createStagingRecord(tx, {
            connectorId: scaffold.connector.id,
            feedId: feed.id,
            runId: run.id,
            organizationId,
            feedType: "item_master",
            externalRecordKey,
            rowNumber,
            rawPayload: row as Prisma.InputJsonValue,
            normalizedPayload,
            status: "failed",
            errorCode: "validation_error",
            errorMessage: errors.join(" "),
          }),
        );
        continue;
      }

      try {
        const result = await db.$transaction(async (tx) => {
          const applied = await applySapItemMasterRow(tx, {
            organizationId,
            row: normalized,
            rawPayload: row as Prisma.InputJsonValue,
            normalizedPayload: normalized as unknown as Prisma.InputJsonValue,
            lastRunId: run.id,
          });

          await createStagingRecord(tx, {
            connectorId: scaffold.connector.id,
            feedId: feed.id,
            runId: run.id,
            organizationId,
            feedType: "item_master",
            externalRecordKey: normalized.externalItemCode,
            rowNumber,
            rawPayload: row as Prisma.InputJsonValue,
            normalizedPayload:
              normalized as unknown as Prisma.InputJsonValue,
            status: "applied",
            domainTargetType: "product_model",
            domainTargetId: applied.productModelId,
          });

          return applied;
        });

        appliedRowCount += 1;
        if (result.createdProductModel) {
          createdProductModelCount += 1;
        }
      } catch (error) {
        failedRowCount += 1;
        errorSummary.apply_error = (errorSummary.apply_error ?? 0) + 1;

        const message =
          error instanceof Error ? error.message : "Failed to apply item master row.";

        await db.$transaction((tx) =>
          createStagingRecord(tx, {
            connectorId: scaffold.connector.id,
            feedId: feed.id,
            runId: run.id,
            organizationId,
            feedType: "item_master",
            externalRecordKey: normalized.externalItemCode,
            rowNumber,
            rawPayload: row as Prisma.InputJsonValue,
            normalizedPayload:
              normalized as unknown as Prisma.InputJsonValue,
            status: "failed",
            errorCode: "apply_error",
            errorMessage: message,
          }),
        );
      }
    }

    const status =
      failedRowCount > 0
        ? appliedRowCount > 0
          ? "completed_with_errors"
          : "failed"
        : "completed";

    await db.$transaction((tx) =>
      updateIntegrationRunSummary(tx, {
        runId: run.id,
        connectorId: scaffold.connector.id,
        feedId: feed.id,
        totalRowCount: rows.length,
        stagedRowCount,
        appliedRowCount,
        failedRowCount,
        status,
        errorSummary,
      }),
    );

    return NextResponse.json({
      run: {
        id: run.id,
        feedType: "item_master",
        status,
        totalRowCount: rows.length,
        stagedRowCount,
        appliedRowCount,
        failedRowCount,
        createdProductModelCount,
        errorSummary,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

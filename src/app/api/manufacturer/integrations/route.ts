import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";
import { ensureSapConnectorScaffold } from "@/lib/integrations/runtime";

import {
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../_utils";

type GenericRecord = Record<string, unknown>;

type IntegrationSettingsPayload = {
  connector?: unknown;
  feeds?: unknown;
};

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function connectorUpdateData(
  patch: GenericRecord,
): Prisma.IntegrationConnectorUpdateInput {
  const name = asString(patch.name);
  const active = asBoolean(patch.active);

  return {
    ...(name ? { name } : {}),
    ...(typeof active === "boolean"
      ? { status: active ? "active" : "inactive" }
      : {}),
    ...(isRecord(patch.settings)
      ? {
          settings: patch.settings as Prisma.InputJsonValue,
        }
      : {}),
  };
}

function feedUpdateData(patch: GenericRecord): Prisma.IntegrationFeedUpdateInput {
  const displayName = asString(patch.displayName);
  const enabled = asBoolean(patch.enabled);

  return {
    ...(displayName ? { displayName } : {}),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...(isRecord(patch.configuration)
      ? {
          configuration: patch.configuration as Prisma.InputJsonValue,
        }
      : {}),
  };
}

function serializeFeed(feed: {
  id: string;
  feedType: string;
  sourceSystem: string;
  displayName: string;
  enabled: boolean;
  configuration: Prisma.JsonValue;
  lastSuccessfulRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: feed.id,
    feedType: feed.feedType,
    sourceSystem: feed.sourceSystem,
    displayName: feed.displayName,
    enabled: feed.enabled,
    configuration: feed.configuration,
    lastSuccessfulRunAt: feed.lastSuccessfulRunAt?.toISOString() ?? null,
    createdAt: feed.createdAt.toISOString(),
    updatedAt: feed.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();

    const [
      result,
      itemMasterRecords,
      distributorMasterRecords,
      dispatchRecords,
      failedStagingRows,
    ] = await Promise.all([
      withDatabaseRetry(() =>
        db.$transaction((tx) => ensureSapConnectorScaffold(tx, organizationId)),
      ),
      withDatabaseRetry(() =>
        db.erpItemMasterRecord.count({
          where: {
            organizationId,
          },
        }),
      ),
      withDatabaseRetry(() =>
        db.erpDistributorMasterRecord.count({
          where: {
            organizationId,
          },
        }),
      ),
      withDatabaseRetry(() =>
        db.erpSerializedDispatchRecord.count({
          where: {
            organizationId,
          },
        }),
      ),
      withDatabaseRetry(() =>
        db.integrationStagingRecord.count({
          where: {
            organizationId,
            status: "failed",
          },
        }),
      ),
    ]);

    return NextResponse.json({
      connector: {
        id: result.connector.id,
        connectorType: result.connector.connectorType,
        name: result.connector.name,
        status: result.connector.status,
        settings: result.connector.settings,
        lastRunAt: result.connector.lastRunAt?.toISOString() ?? null,
        createdAt: result.connector.createdAt.toISOString(),
        updatedAt: result.connector.updatedAt.toISOString(),
      },
      feeds: result.feeds.map(serializeFeed),
      stats: {
        itemMasterRecords,
        distributorMasterRecords,
        dispatchRecords,
        failedStagingRows,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<IntegrationSettingsPayload>(await request.json());

    const connectorPatch = isRecord(body.connector) ? body.connector : {};
    const feedPatches = isRecord(body.feeds) ? body.feeds : {};

    const { connector, feeds } = await withDatabaseRetry(() =>
      db.$transaction(async (tx) => {
        const scaffold = await ensureSapConnectorScaffold(tx, organizationId);

        const updatedConnector = await tx.integrationConnector.update({
          where: { id: scaffold.connector.id },
          data: connectorUpdateData(connectorPatch),
          select: {
            id: true,
            connectorType: true,
            name: true,
            status: true,
            settings: true,
            lastRunAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        const updatedFeeds = await Promise.all(
          scaffold.feeds.map(async (feed) => {
            const patch = isRecord(feedPatches[feed.feedType])
              ? (feedPatches[feed.feedType] as GenericRecord)
              : null;

            if (!patch) {
              return tx.integrationFeed.findUniqueOrThrow({
                where: { id: feed.id },
                select: {
                  id: true,
                  feedType: true,
                  sourceSystem: true,
                  displayName: true,
                  enabled: true,
                  configuration: true,
                  lastSuccessfulRunAt: true,
                  createdAt: true,
                  updatedAt: true,
                },
              });
            }

            return tx.integrationFeed.update({
              where: { id: feed.id },
              data: feedUpdateData(patch),
              select: {
                id: true,
                feedType: true,
                sourceSystem: true,
                displayName: true,
                enabled: true,
                configuration: true,
                lastSuccessfulRunAt: true,
                createdAt: true,
                updatedAt: true,
              },
              });
          }),
        );

        return {
          connector: updatedConnector,
          feeds: updatedFeeds,
        };
      }),
    );

    return NextResponse.json({
      connector: {
        id: connector.id,
        connectorType: connector.connectorType,
        name: connector.name,
        status: connector.status,
        settings: connector.settings,
        lastRunAt: connector.lastRunAt?.toISOString() ?? null,
        createdAt: connector.createdAt.toISOString(),
        updatedAt: connector.updatedAt.toISOString(),
      },
      feeds: feeds.map(serializeFeed),
    });
  } catch (error) {
    return jsonError(error);
  }
}

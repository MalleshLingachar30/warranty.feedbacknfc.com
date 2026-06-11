import { NextResponse } from "next/server";
import { type IntegrationFeedType } from "@prisma/client";

import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";

import { jsonError, requireManufacturerContext } from "../../_utils";

const VALID_FEED_TYPES = new Set<IntegrationFeedType>([
  "item_master",
  "distributor_master",
  "serialized_dispatch",
] as const);

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const url = new URL(request.url);
    const feedTypeParam = url.searchParams.get("feedType");
    const feedType =
      feedTypeParam && VALID_FEED_TYPES.has(feedTypeParam as IntegrationFeedType)
        ? (feedTypeParam as IntegrationFeedType)
        : null;
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 100))
      : 20;

    const runs = await withDatabaseRetry(() =>
      db.integrationRun.findMany({
        where: {
          organizationId,
          ...(feedType ? { feedType } : {}),
        },
        orderBy: {
          startedAt: "desc",
        },
        take: limit,
        select: {
          id: true,
          feedType: true,
          sourceSystem: true,
          status: true,
          totalRowCount: true,
          stagedRowCount: true,
          appliedRowCount: true,
          failedRowCount: true,
          errorSummary: true,
          startedAt: true,
          completedAt: true,
          feed: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      }),
    );

    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        feedId: run.feed.id,
        feedType: run.feedType,
        feedDisplayName: run.feed.displayName,
        sourceSystem: run.sourceSystem,
        status: run.status,
        totalRowCount: run.totalRowCount,
        stagedRowCount: run.stagedRowCount,
        appliedRowCount: run.appliedRowCount,
        failedRowCount: run.failedRowCount,
        errorSummary: run.errorSummary,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

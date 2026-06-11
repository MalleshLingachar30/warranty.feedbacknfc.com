import {
  Prisma,
  type IntegrationFeedType,
  type IntegrationRunStatus,
  type IntegrationStagingRecordStatus,
  type PrismaClient,
} from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export const SAP_CONNECTOR_NAME = "SAP Inbound Connector";

export const SAP_FEED_LABELS: Record<IntegrationFeedType, string> = {
  item_master: "Item Master",
  distributor_master: "Distributor Master",
  serialized_dispatch: "Serialized Dispatch",
};

export async function ensureSapConnectorScaffold(
  tx: Tx,
  organizationId: string,
) {
  const connector = await tx.integrationConnector.upsert({
    where: {
      organizationId_connectorType: {
        organizationId,
        connectorType: "sap",
      },
    },
    create: {
      organizationId,
      connectorType: "sap",
      name: SAP_CONNECTOR_NAME,
      status: "active",
    },
    update: {
      name: SAP_CONNECTOR_NAME,
    },
    select: {
      id: true,
      organizationId: true,
      connectorType: true,
      name: true,
      status: true,
      settings: true,
      lastRunAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const feeds = await Promise.all(
    (Object.keys(SAP_FEED_LABELS) as IntegrationFeedType[]).map((feedType) =>
      tx.integrationFeed.upsert({
        where: {
          connectorId_feedType: {
            connectorId: connector.id,
            feedType,
          },
        },
        create: {
          connectorId: connector.id,
          organizationId,
          feedType,
          sourceSystem: "sap",
          displayName: SAP_FEED_LABELS[feedType],
          enabled: true,
        },
        update: {
          displayName: SAP_FEED_LABELS[feedType],
        },
        select: {
          id: true,
          connectorId: true,
          organizationId: true,
          feedType: true,
          sourceSystem: true,
          displayName: true,
          enabled: true,
          configuration: true,
          lastSuccessfulRunAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ),
  );

  return {
    connector,
    feeds,
  };
}

export async function createIntegrationRun(
  tx: Tx,
  input: {
    connectorId: string;
    feedId: string;
    organizationId: string;
    feedType: IntegrationFeedType;
    sourceSystem?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.integrationRun.create({
    data: {
      connectorId: input.connectorId,
      feedId: input.feedId,
      organizationId: input.organizationId,
      feedType: input.feedType,
      sourceSystem: input.sourceSystem ?? "sap",
      status: "running",
      metadata: input.metadata ?? {},
    },
    select: {
      id: true,
      connectorId: true,
      feedId: true,
      organizationId: true,
      feedType: true,
      sourceSystem: true,
      status: true,
      startedAt: true,
    },
  });
}

export async function createStagingRecord(
  tx: Tx,
  input: {
    connectorId: string;
    feedId: string;
    runId: string;
    organizationId: string;
    feedType: IntegrationFeedType;
    externalRecordKey?: string | null;
    rowNumber?: number | null;
    rawPayload: Prisma.InputJsonValue;
    normalizedPayload?: Prisma.InputJsonValue | null;
    status?: IntegrationStagingRecordStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    domainTargetType?: string | null;
    domainTargetId?: string | null;
  },
) {
  return tx.integrationStagingRecord.create({
    data: {
      connectorId: input.connectorId,
      feedId: input.feedId,
      runId: input.runId,
      organizationId: input.organizationId,
      feedType: input.feedType,
      sourceSystem: "sap",
      externalRecordKey: input.externalRecordKey ?? null,
      rowNumber: input.rowNumber ?? null,
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload ?? Prisma.JsonNull,
      status: input.status ?? "staged",
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      domainTargetType: input.domainTargetType ?? null,
      domainTargetId: input.domainTargetId ?? null,
      processedAt:
        input.status === "applied" || input.status === "failed"
          ? new Date()
          : null,
    },
    select: {
      id: true,
      status: true,
    },
  });
}

export async function updateIntegrationRunSummary(
  tx: Tx,
  input: {
    runId: string;
    connectorId: string;
    feedId: string;
    totalRowCount: number;
    stagedRowCount: number;
    appliedRowCount: number;
    failedRowCount: number;
    status: IntegrationRunStatus;
    errorSummary?: Prisma.InputJsonValue;
  },
) {
  const completedAt = new Date();

  await tx.integrationRun.update({
    where: { id: input.runId },
    data: {
      totalRowCount: input.totalRowCount,
      stagedRowCount: input.stagedRowCount,
      appliedRowCount: input.appliedRowCount,
      failedRowCount: input.failedRowCount,
      status: input.status,
      errorSummary: input.errorSummary ?? {},
      completedAt,
    },
  });

  const connectorPatch: Prisma.IntegrationConnectorUpdateInput = {
    lastRunAt: completedAt,
  };
  const feedPatch: Prisma.IntegrationFeedUpdateInput = {};

  if (input.status === "completed" || input.status === "completed_with_errors") {
    feedPatch.lastSuccessfulRunAt = completedAt;
  }

  await Promise.all([
    tx.integrationConnector.update({
      where: { id: input.connectorId },
      data: connectorPatch,
    }),
    tx.integrationFeed.update({
      where: { id: input.feedId },
      data: feedPatch,
    }),
  ]);
}

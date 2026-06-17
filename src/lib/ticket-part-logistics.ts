import {
  Prisma,
  type PartUsageType,
  type TicketPartDispatchItemStatus,
  type TicketPartDispatchStatus,
} from "@prisma/client";

import type { ResolvedPartUsage } from "@/lib/job-part-usage";

type GenericRecord = Record<string, unknown>;

function asRecord(value: unknown): GenericRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as GenericRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function derivePartNameFromUsage(usage: ResolvedPartUsage): string {
  if (usage.input.partName) {
    return usage.input.partName;
  }

  const metadata = asRecord(usage.usedAsset.metadata);
  return (
    asString(metadata.partName) ??
    asString(metadata.name) ??
    asString(metadata.itemDescription) ??
    usage.usedAsset.publicCode
  );
}

export function derivePartNumberFromUsage(usage: ResolvedPartUsage): string | null {
  if (usage.input.partNumber) {
    return usage.input.partNumber;
  }

  const metadata = asRecord(usage.usedAsset.metadata);
  return (
    asString(metadata.partNumber) ??
    asString(metadata.partCode) ??
    asString(metadata.itemCode) ??
    null
  );
}

export function mapUsageTypeToDispatchItemStatus(
  usageType: PartUsageType,
): TicketPartDispatchItemStatus {
  switch (usageType) {
    case "installed":
      return "installed";
    case "consumed":
      return "consumed";
    case "returned_unused":
      return "returned_unused";
    default:
      return "partially_reconciled";
  }
}

const FINAL_ITEM_STATUSES = new Set<TicketPartDispatchItemStatus>([
  "installed",
  "consumed",
  "returned_unused",
  "cancelled",
]);

export function summarizeDispatchStatus(
  itemStatuses: TicketPartDispatchItemStatus[],
): TicketPartDispatchStatus {
  if (itemStatuses.length === 0) {
    return "planned";
  }

  if (itemStatuses.every((status) => status === "cancelled")) {
    return "cancelled";
  }

  if (itemStatuses.every((status) => FINAL_ITEM_STATUSES.has(status))) {
    return "fully_reconciled";
  }

  if (itemStatuses.some((status) => FINAL_ITEM_STATUSES.has(status))) {
    return "partially_reconciled";
  }

  if (itemStatuses.some((status) => status === "received_by_technician")) {
    return "received_by_technician";
  }

  if (itemStatuses.some((status) => status === "dispatched")) {
    return "dispatched";
  }

  return "planned";
}

export async function generateTicketPartDispatchNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `SPD-${year}-`;
  const latest = await tx.ticketPartDispatch.findFirst({
    where: {
      dispatchNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      dispatchNumber: "desc",
    },
    select: {
      dispatchNumber: true,
    },
  });

  const latestSequence = latest?.dispatchNumber.match(
    new RegExp(`^SPD-${year}-(\\d+)$`),
  );
  const nextSequence =
    latestSequence && latestSequence[1]
      ? Number.parseInt(latestSequence[1], 10) + 1
      : 1;

  return `${prefix}${String(nextSequence).padStart(6, "0")}`;
}

export async function generateTicketPartReturnNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `RTN-${year}-`;
  const latest = await tx.ticketPartReturn.findFirst({
    where: {
      returnNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      returnNumber: "desc",
    },
    select: {
      returnNumber: true,
    },
  });

  const latestSequence = latest?.returnNumber.match(
    new RegExp(`^RTN-${year}-(\\d+)$`),
  );
  const nextSequence =
    latestSequence && latestSequence[1]
      ? Number.parseInt(latestSequence[1], 10) + 1
      : 1;

  return `${prefix}${String(nextSequence).padStart(6, "0")}`;
}

export async function findDispatchItemMatchesForUsages(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    usages: ResolvedPartUsage[];
  },
): Promise<Map<number, string>> {
  const reconcilableIndexes = input.usages
    .map((usage, index) => ({ usage, index }))
    .filter(({ usage }) => usage.input.usageType !== "removed");

  if (reconcilableIndexes.length === 0) {
    return new Map();
  }

  const openDispatchItems = await tx.ticketPartDispatchItem.findMany({
    where: {
      dispatch: {
        ticketId: input.ticketId,
      },
      status: {
        in: [
          "planned",
          "dispatched",
          "received_by_technician",
          "partially_reconciled",
        ],
      },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      spareAssetId: true,
      spareTagId: true,
    },
  });

  const remaining = [...openDispatchItems];
  const matches = new Map<number, string>();

  for (const { usage, index } of reconcilableIndexes) {
    const candidateIndex = remaining.findIndex((item) => {
      if (usage.usedTag?.id && item.spareTagId) {
        return item.spareTagId === usage.usedTag.id;
      }

      return Boolean(item.spareAssetId && item.spareAssetId === usage.usedAsset.id);
    });

    if (candidateIndex === -1) {
      continue;
    }

    const [matched] = remaining.splice(candidateIndex, 1);
    matches.set(index, matched.id);
  }

  return matches;
}

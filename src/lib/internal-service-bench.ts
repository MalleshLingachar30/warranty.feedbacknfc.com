import { createHmac, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { resolveInternalServiceScanContext } from "@/lib/internal-services";

const BENCH_LEASE_TTL_MS = 2 * 60 * 60 * 1000;

export const INTERNAL_SERVICE_BENCH_ACTIVE_STATUSES = [
  "inward_received",
  "awaiting_triage",
  "under_diagnosis",
  "awaiting_parts",
  "repair_in_progress",
  "qa_failed",
] as const;

export type InternalServiceBenchActiveStatus =
  (typeof INTERNAL_SERVICE_BENCH_ACTIVE_STATUSES)[number];

export type InternalServiceBenchScanState =
  | "ready"
  | "wrong_station"
  | "closed_read_only"
  | "needs_inward"
  | "needs_label"
  | "not_found";

export type InternalServiceBenchNextAction =
  | "mark_triaged"
  | "start_diagnosis"
  | "await_parts"
  | "start_repair"
  | "submit_to_qc"
  | "view_read_only";

type InternalServiceStationLeasePayload = {
  v: 1;
  station: "bench";
  orderId: string;
  controllingTagCode: string;
  exp: number;
};

export type InternalServiceBenchScanResult = {
  state: InternalServiceBenchScanState;
  message: string;
  asset: {
    id: string;
    publicCode: string;
    serialNumber: string | null;
    productModel: {
      name: string;
      modelNumber: string | null;
    };
  } | null;
  controllingTagCode: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  nextAction: InternalServiceBenchNextAction | null;
  stationLease: string | null;
};

function internalServiceStationSecret() {
  const secret =
    process.env.INTERNAL_SERVICE_SCAN_SECRET ?? process.env.CLERK_SECRET_KEY;

  if (!secret) {
    throw new Error(
      "INTERNAL_SERVICE_SCAN_SECRET or CLERK_SECRET_KEY must be configured for sticker-led station workflows.",
    );
  }

  return secret;
}

function signStationLease(serializedPayload: string) {
  return createHmac("sha256", internalServiceStationSecret())
    .update(serializedPayload)
    .digest("base64url");
}

export function isInternalServiceBenchActiveStatus(
  status: string,
): status is InternalServiceBenchActiveStatus {
  return INTERNAL_SERVICE_BENCH_ACTIVE_STATUSES.includes(
    status as InternalServiceBenchActiveStatus,
  );
}

export function nextBenchActionForStatus(
  status: string,
): InternalServiceBenchNextAction | null {
  switch (status) {
    case "inward_received":
      return "mark_triaged";
    case "awaiting_triage":
    case "qa_failed":
      return "start_diagnosis";
    case "under_diagnosis":
      return "await_parts";
    case "awaiting_parts":
      return "start_repair";
    case "repair_in_progress":
      return "submit_to_qc";
    case "closed":
    case "completed":
      return "view_read_only";
    default:
      return null;
  }
}

export function issueInternalServiceStationLease(input: {
  station: "bench";
  orderId: string;
  controllingTagCode: string;
  now?: Date;
}) {
  const payload: InternalServiceStationLeasePayload = {
    v: 1,
    station: input.station,
    orderId: input.orderId,
    controllingTagCode: input.controllingTagCode,
    exp: (input.now ?? new Date()).getTime() + BENCH_LEASE_TTL_MS,
  };

  const serializedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `${serializedPayload}.${signStationLease(serializedPayload)}`;
}

export function verifyInternalServiceStationLease(
  token: string,
  expected: {
    station: "bench";
    orderId: string;
    controllingTagCode: string;
  },
) {
  const [serializedPayload, signature] = token.split(".");

  if (!serializedPayload || !signature) {
    return false;
  }

  const expectedSignature = signStationLease(serializedPayload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return false;
  }

  let payload: InternalServiceStationLeasePayload;

  try {
    payload = JSON.parse(
      Buffer.from(serializedPayload, "base64url").toString("utf8"),
    ) as InternalServiceStationLeasePayload;
  } catch {
    return false;
  }

  if (
    payload.v !== 1 ||
    payload.station !== expected.station ||
    payload.orderId !== expected.orderId ||
    payload.controllingTagCode !== expected.controllingTagCode ||
    payload.exp <= Date.now()
  ) {
    return false;
  }

  return true;
}

export async function resolveInternalServiceBenchScanContext(
  tx: Prisma.TransactionClient,
  reference: string,
  options?: {
    manufacturerOrgIds?: string[] | null;
  },
): Promise<InternalServiceBenchScanResult> {
  const scan = await resolveInternalServiceScanContext(tx, reference, options);
  const assetSummary = scan.asset
    ? {
        id: scan.asset.id,
        publicCode: scan.asset.publicCode,
        serialNumber: scan.asset.serialNumber,
        productModel: {
          name: scan.asset.productModel.name,
          modelNumber: scan.asset.productModel.modelNumber,
        },
      }
    : null;

  if (!scan.asset) {
    return {
      state: "not_found",
      message:
        "No serialized internal-service asset was resolved from this scan. Use inward receipt if the unit has not been tagged yet.",
      asset: null,
      controllingTagCode: null,
      order: null,
      nextAction: null,
      stationLease: null,
    };
  }

  if (!scan.controllingTagReady || !scan.controllingTag) {
    return {
      state: "needs_label",
      message:
        "This unit does not yet have a trusted controlling internal-service label. Affix or verify the label from inward receipt before bench execution.",
      asset: assetSummary,
      controllingTagCode: null,
      order: null,
      nextAction: null,
      stationLease: null,
    };
  }

  if (scan.activeOrder) {
    if (isInternalServiceBenchActiveStatus(scan.activeOrder.status)) {
      return {
        state: "ready",
        message: `Bench context verified for ${scan.activeOrder.orderNumber}.`,
        asset: assetSummary,
        controllingTagCode: scan.controllingTag.publicCode,
        order: scan.activeOrder,
        nextAction: nextBenchActionForStatus(scan.activeOrder.status),
        stationLease: issueInternalServiceStationLease({
          station: "bench",
          orderId: scan.activeOrder.id,
          controllingTagCode: scan.controllingTag.publicCode,
        }),
      };
    }

    return {
      state: "wrong_station",
      message:
        "This unit has an active internal-service order, but it is no longer in a bench execution stage.",
      asset: assetSummary,
      controllingTagCode: scan.controllingTag.publicCode,
      order: scan.activeOrder,
      nextAction: null,
      stationLease: null,
    };
  }

  if (scan.latestClosedOrder) {
    return {
      state: "closed_read_only",
      message:
        "This internal-service order is already closed. Bench scan opens it in read-only mode only.",
      asset: assetSummary,
      controllingTagCode: scan.controllingTag.publicCode,
      order: scan.latestClosedOrder,
      nextAction: "view_read_only",
      stationLease: null,
    };
  }

  return {
    state: "needs_inward",
    message:
      "The unit is sticker-ready, but no internal-service order exists yet. Start with inward receipt before bench execution.",
    asset: assetSummary,
    controllingTagCode: scan.controllingTag.publicCode,
    order: null,
    nextAction: null,
    stationLease: null,
  };
}

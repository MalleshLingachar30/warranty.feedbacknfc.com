export const PREVENTIVE_MAINTENANCE_PROVIDER_EVENT_STATUSES = [
  "accepted",
  "sent",
  "delivered",
  "bounced",
  "suppressed",
  "delivery_delayed",
  "complained",
  "failed",
  "unknown",
] as const;

export type PreventiveMaintenanceProviderEventStatus =
  (typeof PREVENTIVE_MAINTENANCE_PROVIDER_EVENT_STATUSES)[number];

export const PREVENTIVE_MAINTENANCE_RECIPIENT_HYGIENE_STATUSES = [
  "bounced",
  "suppressed",
  "complained",
] as const;

export type PreventiveMaintenanceRecipientHygieneStatus =
  (typeof PREVENTIVE_MAINTENANCE_RECIPIENT_HYGIENE_STATUSES)[number];

export type PreventiveMaintenanceProviderReconciliationEvent = {
  providerMessageId: string;
  status: PreventiveMaintenanceProviderEventStatus;
  occurredAt: Date;
};

const MAX_RECONCILIATION_EVENTS = 100;
const PROVIDER_STATUS_PRECEDENCE: Record<
  PreventiveMaintenanceProviderEventStatus,
  number
> = {
  unknown: 0,
  accepted: 1,
  sent: 2,
  delivery_delayed: 3,
  failed: 4,
  delivered: 5,
  bounced: 6,
  suppressed: 6,
  complained: 7,
};

export class PreventiveMaintenanceProviderReconciliationInputError extends Error {}

export function mapResendProviderEventStatus(
  value: unknown,
): PreventiveMaintenanceProviderEventStatus {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^email[._-]/, "");
  switch (normalized) {
    case "accepted":
    case "queued":
      return "accepted";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "bounced":
    case "bounce":
      return "bounced";
    case "suppressed":
      return "suppressed";
    case "delivery_delayed":
    case "delivery-delayed":
    case "delayed":
      return "delivery_delayed";
    case "complained":
    case "complaint":
      return "complained";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

export function hygieneStatusForProviderEvent(
  status: PreventiveMaintenanceProviderEventStatus,
): PreventiveMaintenanceRecipientHygieneStatus | null {
  return PREVENTIVE_MAINTENANCE_RECIPIENT_HYGIENE_STATUSES.includes(
    status as PreventiveMaintenanceRecipientHygieneStatus,
  )
    ? (status as PreventiveMaintenanceRecipientHygieneStatus)
    : null;
}

export function shouldApplyPreventiveMaintenanceProviderEvent(input: {
  currentStatus: PreventiveMaintenanceProviderEventStatus | null;
  currentOccurredAt: Date | null;
  nextStatus: PreventiveMaintenanceProviderEventStatus;
  nextOccurredAt: Date;
}) {
  if (!input.currentStatus || !input.currentOccurredAt) {
    return true;
  }

  const timestampDifference =
    input.nextOccurredAt.getTime() - input.currentOccurredAt.getTime();
  if (timestampDifference !== 0) {
    return timestampDifference > 0;
  }

  return (
    PROVIDER_STATUS_PRECEDENCE[input.nextStatus] >=
    PROVIDER_STATUS_PRECEDENCE[input.currentStatus]
  );
}

export function recipientHygieneBlockReason(
  status: PreventiveMaintenanceRecipientHygieneStatus,
) {
  return `recipient_hygiene_blocked_${status}`;
}

export function emptyProviderEventStatusCounts(): Record<
  PreventiveMaintenanceProviderEventStatus,
  number
> {
  return {
    accepted: 0,
    sent: 0,
    delivered: 0,
    bounced: 0,
    suppressed: 0,
    delivery_delayed: 0,
    complained: 0,
    failed: 0,
    unknown: 0,
  };
}

export function countProviderEventStatuses(
  events: Array<{
    providerEventStatus: PreventiveMaintenanceProviderEventStatus | null;
  }>,
) {
  const counts = emptyProviderEventStatusCounts();
  for (const event of events) {
    if (event.providerEventStatus) {
      counts[event.providerEventStatus] += 1;
    }
  }
  return counts;
}

function parseEventTimestamp(value: unknown, fallback: Date) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PreventiveMaintenanceProviderReconciliationInputError(
      "Each provider event timestamp must be a valid date-time.",
    );
  }
  return parsed;
}

export function parsePreventiveMaintenanceProviderReconciliationRequest(
  body: unknown,
  now = new Date(),
): PreventiveMaintenanceProviderReconciliationEvent[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PreventiveMaintenanceProviderReconciliationInputError(
      "Provider reconciliation requires an events or results array.",
    );
  }

  const object = body as Record<string, unknown>;
  const values = Array.isArray(object.events)
    ? object.events
    : Array.isArray(object.results)
      ? object.results
      : null;

  if (
    !values ||
    values.length === 0 ||
    values.length > MAX_RECONCILIATION_EVENTS
  ) {
    throw new PreventiveMaintenanceProviderReconciliationInputError(
      `Provider reconciliation requires 1-${MAX_RECONCILIATION_EVENTS} events.`,
    );
  }

  return values.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new PreventiveMaintenanceProviderReconciliationInputError(
        "Each provider event must be an object.",
      );
    }

    const event = value as Record<string, unknown>;
    const providerMessageId = event.providerMessageId;
    if (
      typeof providerMessageId !== "string" ||
      !providerMessageId.trim() ||
      providerMessageId.length > 255
    ) {
      throw new PreventiveMaintenanceProviderReconciliationInputError(
        "Each provider event requires a valid providerMessageId.",
      );
    }

    return {
      providerMessageId: providerMessageId.trim(),
      status: mapResendProviderEventStatus(
        event.status ??
          event.event ??
          event.type ??
          event.resendLastEvent ??
          event.lastEvent ??
          event.last_event,
      ),
      occurredAt: parseEventTimestamp(
        event.occurredAt ?? event.createdAt ?? event.resendCreatedAt,
        now,
      ),
    };
  });
}

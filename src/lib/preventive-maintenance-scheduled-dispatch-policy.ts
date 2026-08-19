export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_WINDOW_MINUTES = 15;
export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS = 3;
export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT = 50;
export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MIN_BATCH_LIMIT = 1;
export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_LEASE_MS = 14 * 60_000;
export const PREVENTIVE_MAINTENANCE_DELIVERY_CLAIM_LEASE_MS = 5 * 60_000;

type ScheduledDispatcherModeInput = {
  schedulerEnabled: boolean;
  liveDeliveryRequested: boolean;
  liveEmailStatus: "disabled" | "incomplete" | "ready";
  liveEmailMissingConfiguration: readonly string[];
  rolloutControlBlockingReasons?: readonly string[];
};

export type PreventiveMaintenanceScheduledDispatcherMode = {
  enabled: boolean;
  mode: "disabled" | "dry_run" | "live";
  dryRun: boolean;
  liveDeliveryRequested: boolean;
  blockingReasons: string[];
};

export function resolvePreventiveMaintenanceScheduledDispatcherMode(
  input: ScheduledDispatcherModeInput,
): PreventiveMaintenanceScheduledDispatcherMode {
  if (!input.schedulerEnabled) {
    return {
      enabled: false,
      mode: "disabled",
      dryRun: true,
      liveDeliveryRequested: input.liveDeliveryRequested,
      blockingReasons: ["PM_NOTIFICATION_SCHEDULED_DISPATCH_ENABLED"],
    };
  }

  if (!input.liveDeliveryRequested) {
    return {
      enabled: true,
      mode: "dry_run",
      dryRun: true,
      liveDeliveryRequested: false,
      blockingReasons: [],
    };
  }

  if (input.liveEmailStatus !== "ready") {
    return {
      enabled: true,
      mode: "dry_run",
      dryRun: true,
      liveDeliveryRequested: true,
      blockingReasons:
        input.liveEmailStatus === "disabled"
          ? ["PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED"]
          : [...input.liveEmailMissingConfiguration],
    };
  }

  if (input.rolloutControlBlockingReasons?.length) {
    return {
      enabled: true,
      mode: "dry_run",
      dryRun: true,
      liveDeliveryRequested: true,
      blockingReasons: [...input.rolloutControlBlockingReasons],
    };
  }

  return {
    enabled: true,
    mode: "live",
    dryRun: false,
    liveDeliveryRequested: true,
    blockingReasons: [],
  };
}

export function buildPreventiveMaintenanceScheduledRunWindow(
  now: Date,
  windowMinutes = PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_WINDOW_MINUTES,
) {
  const windowMs = windowMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export function buildPreventiveMaintenanceScheduledRunKey(now: Date) {
  return `pm-scheduled-dispatch:${buildPreventiveMaintenanceScheduledRunWindow(now).toISOString()}`;
}

export type PreventiveMaintenanceScheduledBatchLimitConfiguration = {
  batchLimit: number;
  configuredValue: string | null;
  source: "default" | "environment";
  clamped: boolean;
  blockingReasons: string[];
};

export type PreventiveMaintenanceScheduledOrganizationScopeConfiguration = {
  mode: "all" | "allowlist";
  organizationIds: string[];
  configuredValue: string | null;
  invalidOrganizationIds: string[];
  blockingReasons: string[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolvePreventiveMaintenanceScheduledDispatchBatchLimit(
  rawValue = process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_BATCH_LIMIT,
): PreventiveMaintenanceScheduledBatchLimitConfiguration {
  const configuredValue = rawValue?.trim() || null;

  if (!configuredValue) {
    return {
      batchLimit: PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT,
      configuredValue,
      source: "default",
      clamped: false,
      blockingReasons: [],
    };
  }

  const parsed = Number(configuredValue);
  if (!Number.isInteger(parsed)) {
    return {
      batchLimit: PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MIN_BATCH_LIMIT,
      configuredValue,
      source: "environment",
      clamped: false,
      blockingReasons: ["PM_NOTIFICATION_SCHEDULED_DISPATCH_BATCH_LIMIT"],
    };
  }

  const batchLimit = Math.min(
    PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT,
    Math.max(PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MIN_BATCH_LIMIT, parsed),
  );

  return {
    batchLimit,
    configuredValue,
    source: "environment",
    clamped: batchLimit !== parsed,
    blockingReasons: [],
  };
}

export function resolvePreventiveMaintenanceScheduledOrganizationScope(
  rawValue = process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_ORGANIZATION_IDS,
): PreventiveMaintenanceScheduledOrganizationScopeConfiguration {
  const configuredValue = rawValue?.trim() || null;

  if (!configuredValue) {
    return {
      mode: "all",
      organizationIds: [],
      configuredValue,
      invalidOrganizationIds: [],
      blockingReasons: [],
    };
  }

  const entries = configuredValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const organizationIds = [
    ...new Set(entries.filter((entry) => UUID_PATTERN.test(entry))),
  ];
  const invalidOrganizationIds = entries.filter(
    (entry) => !UUID_PATTERN.test(entry),
  );

  return {
    mode: organizationIds.length > 0 ? "allowlist" : "all",
    organizationIds,
    configuredValue,
    invalidOrganizationIds,
    blockingReasons:
      invalidOrganizationIds.length > 0 || organizationIds.length === 0
        ? ["PM_NOTIFICATION_SCHEDULED_DISPATCH_ORGANIZATION_IDS"]
        : [],
  };
}

type ScheduledAttemptStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "dead_letter"
  | "skipped";

type ScheduledAttemptPolicyInput = {
  status: ScheduledAttemptStatus;
  attemptNumber: number;
  nextRetryAt: Date | null;
  claimExpiresAt: Date | null;
  now: Date;
  maxAttempts?: number;
};

export type PreventiveMaintenanceScheduledAttemptAction =
  | {
      action: "claim";
      nextAttemptNumber: number;
      retrying: boolean;
      reclaimingExpiredClaim: boolean;
    }
  | {
      action: "defer_retry";
    }
  | {
      action: "dead_letter";
    }
  | {
      action: "ignore";
    };

export function resolvePreventiveMaintenanceScheduledAttemptAction(
  input: ScheduledAttemptPolicyInput,
): PreventiveMaintenanceScheduledAttemptAction {
  const maxAttempts =
    input.maxAttempts ?? PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS;

  if (input.status === "queued") {
    return {
      action: "claim",
      nextAttemptNumber: Math.max(1, input.attemptNumber),
      retrying: false,
      reclaimingExpiredClaim: false,
    };
  }

  if (input.status === "sending") {
    if (!input.claimExpiresAt || input.claimExpiresAt <= input.now) {
      return {
        action: "claim",
        nextAttemptNumber: Math.max(1, input.attemptNumber),
        retrying: input.attemptNumber > 1,
        reclaimingExpiredClaim: true,
      };
    }

    return { action: "ignore" };
  }

  if (input.status === "failed") {
    if (input.attemptNumber >= maxAttempts) {
      return { action: "dead_letter" };
    }

    if (input.nextRetryAt && input.nextRetryAt > input.now) {
      return { action: "defer_retry" };
    }

    return {
      action: "claim",
      nextAttemptNumber: input.attemptNumber + 1,
      retrying: true,
      reclaimingExpiredClaim: false,
    };
  }

  return { action: "ignore" };
}

export function getPreventiveMaintenanceNextRetryAt(input: {
  now: Date;
  failedAttemptNumber: number;
}) {
  const baseDelayMinutes = 15;
  const maxDelayMinutes = 24 * 60;
  const delayMinutes = Math.min(
    maxDelayMinutes,
    baseDelayMinutes * 2 ** Math.max(0, input.failedAttemptNumber - 1),
  );

  return new Date(input.now.getTime() + delayMinutes * 60_000);
}

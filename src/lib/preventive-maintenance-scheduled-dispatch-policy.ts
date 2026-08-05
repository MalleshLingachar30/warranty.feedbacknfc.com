export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_WINDOW_MINUTES = 15;
export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS = 3;
export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT = 50;
export const PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_LEASE_MS = 14 * 60_000;
export const PREVENTIVE_MAINTENANCE_DELIVERY_CLAIM_LEASE_MS = 5 * 60_000;

type ScheduledDispatcherModeInput = {
  schedulerEnabled: boolean;
  liveDeliveryRequested: boolean;
  liveEmailStatus: "disabled" | "incomplete" | "ready";
  liveEmailMissingConfiguration: readonly string[];
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

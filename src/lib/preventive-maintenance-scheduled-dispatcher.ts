import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { getPreventiveMaintenanceEmailDeliveryReadiness } from "@/lib/preventive-maintenance-email-delivery";
import { dispatchPreventiveMaintenanceNotificationsForScheduledRun } from "@/lib/preventive-maintenance-notification-dispatch";
import {
  finishPreventiveMaintenanceNotificationAuditSafely,
  preventiveMaintenanceAuditErrorMessage,
  startPreventiveMaintenanceNotificationSystemAudit,
} from "@/lib/preventive-maintenance-notification-audit";
import {
  buildPreventiveMaintenanceScheduledRunKey,
  buildPreventiveMaintenanceScheduledRunWindow,
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT,
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_LEASE_MS,
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS,
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_WINDOW_MINUTES,
  resolvePreventiveMaintenanceScheduledDispatcherMode,
} from "@/lib/preventive-maintenance-scheduled-dispatch-policy";

const SCHEDULER_LEASE_ID = "pm-scheduled-dispatcher";

const scheduledRunSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceNotificationScheduledRunSelect>()(
    {
      id: true,
      runKey: true,
      status: true,
      dryRun: true,
      requestedLiveDelivery: true,
      scheduleWindowStartedAt: true,
      startedAt: true,
      completedAt: true,
      scannedIntentCount: true,
      candidateAttemptCount: true,
      createdAttemptCount: true,
      existingAttemptCount: true,
      providerCallCount: true,
      retriedAttemptCount: true,
      deferredRetryCount: true,
      deadLetteredAttemptCount: true,
      preferenceSuppressedCount: true,
      suppressionReasonCounts: true,
      errorMessage: true,
    },
  );

type ScheduledRun =
  Prisma.PreventiveMaintenanceNotificationScheduledRunGetPayload<{
    select: typeof scheduledRunSelect;
  }>;

export function getPreventiveMaintenanceScheduledDispatcherConfiguration() {
  const emailReadiness =
    getPreventiveMaintenanceEmailDeliveryReadiness().liveEmail;
  const mode = resolvePreventiveMaintenanceScheduledDispatcherMode({
    schedulerEnabled:
      process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_ENABLED === "true",
    liveDeliveryRequested:
      process.env.PM_NOTIFICATION_SCHEDULED_LIVE_DELIVERY_ENABLED === "true",
    liveEmailStatus: emailReadiness.status,
    liveEmailMissingConfiguration: emailReadiness.missingConfiguration,
  });

  return {
    ...mode,
    authorizationConfigured: Boolean(
      process.env.PM_NOTIFICATION_SCHEDULER_CRON_SECRET?.trim() ||
      process.env.CRON_SECRET?.trim(),
    ),
    schedule: `Every ${PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_WINDOW_MINUTES} minutes`,
    batchLimit: PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT,
    maxAttempts: PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS,
  };
}

export async function runPreventiveMaintenanceScheduledDispatcher(input?: {
  now?: Date;
}) {
  const configuration =
    getPreventiveMaintenanceScheduledDispatcherConfiguration();
  if (!configuration.enabled) {
    return {
      disposition: "disabled" as const,
      configuration,
      run: null,
    };
  }

  const now = input?.now ?? new Date();
  const runKey = buildPreventiveMaintenanceScheduledRunKey(now);
  const scheduleWindowStartedAt =
    buildPreventiveMaintenanceScheduledRunWindow(now);

  let run: ScheduledRun;
  try {
    run = await db.preventiveMaintenanceNotificationScheduledRun.create({
      data: {
        runKey,
        dryRun: configuration.dryRun,
        requestedLiveDelivery: configuration.liveDeliveryRequested,
        scheduleWindowStartedAt,
        metadata: {
          mode: configuration.mode,
          blockingReasons: configuration.blockingReasons,
          batchLimit: configuration.batchLimit,
          maxAttempts: configuration.maxAttempts,
        },
      },
      select: scheduledRunSelect,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingRun =
      await db.preventiveMaintenanceNotificationScheduledRun.findUniqueOrThrow({
        where: { runKey },
        select: scheduledRunSelect,
      });

    return {
      disposition: "duplicate" as const,
      configuration,
      run: serializeScheduledRun(existingRun),
    };
  }

  const claimToken = randomUUID();
  let leaseAcquired: boolean;
  try {
    leaseAcquired = await acquireSchedulerLease({
      runId: run.id,
      claimToken,
      now,
    });
  } catch (error) {
    await releaseSchedulerLeaseSafely(claimToken);
    const errorMessage = preventiveMaintenanceAuditErrorMessage(error);
    const failedRun =
      await db.preventiveMaintenanceNotificationScheduledRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage,
          metadata: {
            decision: "lease_acquisition_failed",
          },
        },
        select: scheduledRunSelect,
      });

    return {
      disposition: "failed" as const,
      configuration,
      run: serializeScheduledRun(failedRun),
    };
  }
  if (!leaseAcquired) {
    const completedRun =
      await db.preventiveMaintenanceNotificationScheduledRun.update({
        where: { id: run.id },
        data: {
          status: "completed_with_failures",
          completedAt: new Date(),
          errorMessage:
            "An overlapping scheduled dispatcher run holds the active lease.",
          metadata: {
            decision: "overlap_suppressed",
            leaseId: SCHEDULER_LEASE_ID,
          },
        },
        select: scheduledRunSelect,
      });
    const overlapAudit =
      await startPreventiveMaintenanceNotificationSystemAudit({
        operation: "scheduled_dispatch",
        metadata: {
          scheduledRunId: run.id,
          runKey,
          mode: configuration.mode,
          blockingReasons: configuration.blockingReasons,
          leaseAcquired: false,
        },
      });
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: overlapAudit.id,
      outcome: "rejected",
      errorMessage: "Scheduled dispatcher overlap suppressed by active lease.",
      metadata: {
        scheduledRunId: run.id,
        decision: "overlap_suppressed",
      },
    });

    return {
      disposition: "overlap_suppressed" as const,
      configuration,
      run: serializeScheduledRun(completedRun),
    };
  }

  let auditId: string | null = null;
  try {
    const audit = await startPreventiveMaintenanceNotificationSystemAudit({
      operation: "scheduled_dispatch",
      metadata: {
        scheduledRunId: run.id,
        runKey,
        mode: configuration.mode,
        blockingReasons: configuration.blockingReasons,
        leaseAcquired: true,
      },
    });
    auditId = audit.id;
    const result =
      await dispatchPreventiveMaintenanceNotificationsForScheduledRun({
        scheduledRunId: run.id,
        channels: ["email"],
        limit: configuration.batchLimit,
        dryRun: configuration.dryRun,
        confirmLiveDelivery: !configuration.dryRun,
        retryFailed: true,
        triggerType: null,
      });
    const completedWithFailures =
      result.failedAttemptCount > 0 ||
      result.deadLetteredAttemptCount > 0 ||
      result.newlyDeadLetteredAttemptCount > 0;
    const completedRun =
      await db.preventiveMaintenanceNotificationScheduledRun.update({
        where: { id: run.id },
        data: {
          status: completedWithFailures
            ? "completed_with_failures"
            : "succeeded",
          completedAt: new Date(),
          scannedIntentCount: result.scannedIntentCount,
          candidateAttemptCount: result.candidateAttemptCount,
          createdAttemptCount: result.createdAttemptCount,
          existingAttemptCount: result.existingAttemptCount,
          providerCallCount: result.providerCallCount,
          retriedAttemptCount: result.retriedAttemptCount,
          deferredRetryCount: result.deferredRetryCount,
          deadLetteredAttemptCount: result.newlyDeadLetteredAttemptCount,
          preferenceSuppressedCount: result.preferenceSuppressedCount,
          suppressionReasonCounts: result.suppressionReasonCounts,
          metadata: {
            mode: configuration.mode,
            blockingReasons: configuration.blockingReasons,
            missingRecipientCount: result.missingRecipientCount,
            reclaimedAttemptCount: result.reclaimedAttemptCount,
            skippedAttemptCount: result.skippedAttemptCount,
            sentAttemptCount: result.sentAttemptCount,
          },
        },
        select: scheduledRunSelect,
      });
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId,
      outcome: completedWithFailures ? "completed_with_failures" : "succeeded",
      notificationIntentCount: result.scannedIntentCount,
      deliveryAttemptCount: result.candidateAttemptCount,
      providerCallCount: result.providerCallCount,
      metadata: {
        scheduledRunId: run.id,
        mode: configuration.mode,
        preferenceSuppressedCount: result.preferenceSuppressedCount,
        suppressionReasonCounts: result.suppressionReasonCounts,
        retriedAttemptCount: result.retriedAttemptCount,
        deferredRetryCount: result.deferredRetryCount,
        reclaimedAttemptCount: result.reclaimedAttemptCount,
        newlyDeadLetteredAttemptCount: result.newlyDeadLetteredAttemptCount,
      },
    });

    return {
      disposition: "completed" as const,
      configuration,
      run: serializeScheduledRun(completedRun),
    };
  } catch (error) {
    const errorMessage = preventiveMaintenanceAuditErrorMessage(error);
    const failedRun =
      await db.preventiveMaintenanceNotificationScheduledRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage,
        },
        select: scheduledRunSelect,
      });
    if (auditId) {
      await finishPreventiveMaintenanceNotificationAuditSafely({
        auditId,
        outcome: "failed",
        errorMessage,
        metadata: {
          scheduledRunId: run.id,
          mode: configuration.mode,
        },
      });
    }

    return {
      disposition: "failed" as const,
      configuration,
      run: serializeScheduledRun(failedRun),
    };
  } finally {
    await releaseSchedulerLeaseSafely(claimToken);
  }
}

export async function getPreventiveMaintenanceScheduledDispatcherStatus(
  notificationWhere: Prisma.PreventiveMaintenanceNotificationIntentWhereInput,
) {
  const configuration =
    getPreventiveMaintenanceScheduledDispatcherConfiguration();
  const [lastRun, deadLetterCount] = await Promise.all([
    db.preventiveMaintenanceNotificationScheduledRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: scheduledRunSelect,
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: {
        status: "dead_letter",
        notificationIntent: {
          is: notificationWhere,
        },
      },
    }),
  ]);

  return {
    configuration,
    lastRun: lastRun ? serializeScheduledRun(lastRun) : null,
    deadLetterCount,
  };
}

async function acquireSchedulerLease(input: {
  runId: string;
  claimToken: string;
  now: Date;
}) {
  const expiresAt = new Date(
    input.now.getTime() + PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_LEASE_MS,
  );
  const rows = await db.$queryRaw<Array<{ claim_token: string }>>(Prisma.sql`
    INSERT INTO "preventive_maintenance_notification_scheduler_leases"
      ("id", "claim_token", "run_id", "expires_at", "created_at", "updated_at")
    VALUES
      (${SCHEDULER_LEASE_ID}, ${input.claimToken}, ${input.runId}::uuid, ${expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE SET
      "claim_token" = EXCLUDED."claim_token",
      "run_id" = EXCLUDED."run_id",
      "expires_at" = EXCLUDED."expires_at",
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "preventive_maintenance_notification_scheduler_leases"."expires_at" <= CURRENT_TIMESTAMP
    RETURNING "claim_token"
  `);

  return rows.some((row) => row.claim_token === input.claimToken);
}

async function releaseSchedulerLease(claimToken: string) {
  await db.preventiveMaintenanceNotificationSchedulerLease.deleteMany({
    where: {
      id: SCHEDULER_LEASE_ID,
      claimToken,
    },
  });
}

async function releaseSchedulerLeaseSafely(claimToken: string) {
  try {
    await releaseSchedulerLease(claimToken);
  } catch (error) {
    console.error("Unable to release PM scheduled dispatcher lease", {
      claimToken,
      error,
    });
  }
}

function serializeScheduledRun(run: ScheduledRun) {
  return {
    ...run,
    scheduleWindowStartedAt: run.scheduleWindowStartedAt.toISOString(),
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

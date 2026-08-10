import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { canDispatchPreventiveMaintenanceNotifications } from "@/lib/preventive-maintenance-notification-dispatch";
import { isPreventiveMaintenancePreferenceSuppressionReason } from "@/lib/preventive-maintenance-notification-preference-policy";
import {
  countPmNotificationAttemptStatuses,
  durationMinutes,
  emptyAttemptStatusCounts,
  emptyChannelStatusCounts,
  emptyNotificationStatusCounts,
  isPmNotificationReportingGlobalScope,
  sanitizePmNotificationReportingDiagnostic,
  summarizePmNotificationDurations,
  type PmNotificationReportCsvRow,
  type PmNotificationReportingFilters,
} from "@/lib/preventive-maintenance-notification-reporting-policy";
import {
  PreventiveMaintenanceNotificationApiError,
  resolvePreventiveMaintenanceNotificationAudience,
  type PreventiveMaintenanceNotificationAudience,
} from "@/lib/preventive-maintenance-notifications";
import { getPreventiveMaintenanceScheduledDispatcherConfiguration } from "@/lib/preventive-maintenance-scheduled-dispatcher";

const PM_STATUS_TIMELINE_EVENTS = [
  "scheduled",
  "started",
  "completed",
  "cancelled",
] as const;

const scheduledRunReportingSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceNotificationScheduledRunSelect>()(
    {
      id: true,
      status: true,
      dryRun: true,
      scheduleWindowStartedAt: true,
      startedAt: true,
      completedAt: true,
      scannedIntentCount: true,
      candidateAttemptCount: true,
      createdAttemptCount: true,
      existingAttemptCount: true,
      retriedAttemptCount: true,
      deadLetteredAttemptCount: true,
      preferenceSuppressedCount: true,
      metadata: true,
    },
  );

type ScheduledRunReportingRow =
  Prisma.PreventiveMaintenanceNotificationScheduledRunGetPayload<{
    select: typeof scheduledRunReportingSelect;
  }>;

export type SerializedPmNotificationReporting = Awaited<
  ReturnType<typeof getPmNotificationReporting>
>;

function reportingScopeWhere(
  audience: PreventiveMaintenanceNotificationAudience,
): Prisma.PreventiveMaintenanceNotificationIntentWhereInput {
  if (isPmNotificationReportingGlobalScope(audience.role)) {
    return { channel: "in_app" };
  }

  return audience.where;
}

export async function resolvePmNotificationReportingAudience() {
  const audience = await resolvePreventiveMaintenanceNotificationAudience();

  if (!canDispatchPreventiveMaintenanceNotifications(audience.role)) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  return audience;
}

function numberFromMetadata(metadata: Prisma.JsonValue, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return 0;
  }

  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dispatchSourceFromMetadata(metadata: Prisma.JsonValue) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const source = metadata.dispatchSource;
  return source === "manual_pilot" ||
    source === "scheduled" ||
    source === "manual"
    ? source
    : null;
}

function serializeRunTimestamp(run: ScheduledRunReportingRow | null) {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    status: run.status,
    dryRun: run.dryRun,
    scheduleWindowStartedAt: run.scheduleWindowStartedAt.toISOString(),
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

async function getSchedulerHealth(input: {
  audience: PreventiveMaintenanceNotificationAudience;
  scopeWhere: Prisma.PreventiveMaintenanceNotificationIntentWhereInput;
}) {
  const globalScope = isPmNotificationReportingGlobalScope(input.audience.role);
  const runWhere: Prisma.PreventiveMaintenanceNotificationScheduledRunWhereInput =
    globalScope
      ? {}
      : {
          deliveryAttempts: {
            some: {
              notificationIntent: {
                is: input.scopeWhere,
              },
            },
          },
        };
  const [latestRun, lastSuccessfulRun] = await Promise.all([
    db.preventiveMaintenanceNotificationScheduledRun.findFirst({
      where: runWhere,
      orderBy: { startedAt: "desc" },
      select: scheduledRunReportingSelect,
    }),
    db.preventiveMaintenanceNotificationScheduledRun.findFirst({
      where: {
        ...runWhere,
        status: "succeeded",
      },
      orderBy: { startedAt: "desc" },
      select: scheduledRunReportingSelect,
    }),
  ]);

  let counters = {
    scannedIntentCount: latestRun?.scannedIntentCount ?? 0,
    candidateAttemptCount: latestRun?.candidateAttemptCount ?? 0,
    createdAttemptCount: latestRun?.createdAttemptCount ?? 0,
    existingAttemptCount: latestRun?.existingAttemptCount ?? 0,
    skippedAttemptCount: latestRun
      ? numberFromMetadata(latestRun.metadata, "skippedAttemptCount")
      : 0,
    preferenceSuppressedCount: latestRun?.preferenceSuppressedCount ?? 0,
    retriedAttemptCount: latestRun?.retriedAttemptCount ?? 0,
    deadLetteredAttemptCount: latestRun?.deadLetteredAttemptCount ?? 0,
  };

  if (!globalScope && latestRun) {
    const attempts =
      await db.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
        where: {
          scheduledRunId: latestRun.id,
          notificationIntent: {
            is: input.scopeWhere,
          },
        },
        select: {
          notificationIntentId: true,
          status: true,
          skipReason: true,
          attemptNumber: true,
          createdAt: true,
        },
      });
    const createdAttemptCount = attempts.filter(
      (attempt) => attempt.createdAt >= latestRun.startedAt,
    ).length;

    counters = {
      scannedIntentCount: new Set(
        attempts.map((attempt) => attempt.notificationIntentId),
      ).size,
      candidateAttemptCount: attempts.length,
      createdAttemptCount,
      existingAttemptCount: Math.max(0, attempts.length - createdAttemptCount),
      skippedAttemptCount: attempts.filter(
        (attempt) => attempt.status === "skipped",
      ).length,
      preferenceSuppressedCount: attempts.filter((attempt) =>
        isPreventiveMaintenancePreferenceSuppressionReason(attempt.skipReason),
      ).length,
      retriedAttemptCount: attempts.filter(
        (attempt) => attempt.attemptNumber > 1,
      ).length,
      deadLetteredAttemptCount: attempts.filter(
        (attempt) => attempt.status === "dead_letter",
      ).length,
    };
  }

  const configuration =
    getPreventiveMaintenanceScheduledDispatcherConfiguration();

  return {
    scope: globalScope ? ("system" as const) : ("audience" as const),
    configuration: {
      enabled: configuration.enabled,
      mode: configuration.mode,
      schedule: configuration.schedule,
      batchLimit: configuration.batchLimit,
      maxAttempts: configuration.maxAttempts,
    },
    latestRun: serializeRunTimestamp(latestRun),
    lastSuccessfulRun: serializeRunTimestamp(lastSuccessfulRun),
    counters,
  };
}

export async function getPmNotificationReporting(input: {
  audience: PreventiveMaintenanceNotificationAudience;
  filters: PmNotificationReportingFilters;
}) {
  if (!canDispatchPreventiveMaintenanceNotifications(input.audience.role)) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  const scopeWhere = reportingScopeWhere(input.audience);
  const notificationWhere: Prisma.PreventiveMaintenanceNotificationIntentWhereInput =
    {
      AND: [
        scopeWhere,
        {
          createdAt: {
            gte: input.filters.startAt,
            lt: input.filters.endAtExclusive,
          },
        },
        ...(input.filters.status === "all"
          ? []
          : [{ status: input.filters.status }]),
      ],
    };
  const attemptWhere: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptWhereInput =
    {
      notificationIntent: {
        is: notificationWhere,
      },
      ...(input.filters.channel === "all"
        ? {}
        : { channel: input.filters.channel }),
    };

  const [
    notifications,
    attemptGroups,
    recentAttempts,
    missingRecipientCount,
    preferenceSuppressedCount,
    scheduler,
    manualPilotAuditGroups,
  ] = await Promise.all([
    db.preventiveMaintenanceNotificationIntent.findMany({
      where: notificationWhere,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        triggerType: true,
        recipientRole: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        event: {
          select: {
            eventNumber: true,
            timelineEntries: {
              where: {
                eventType: { in: [...PM_STATUS_TIMELINE_EVENTS] },
                createdAt: { gte: input.filters.startAt },
              },
              orderBy: { createdAt: "asc" },
              select: {
                eventType: true,
                createdAt: true,
              },
            },
          },
        },
        deliveryAttempts: {
          where:
            input.filters.channel === "all"
              ? undefined
              : { channel: input.filters.channel },
          select: {
            channel: true,
            status: true,
          },
        },
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.groupBy({
      by: ["channel", "status"],
      where: attemptWhere,
      _count: { _all: true },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
      where: attemptWhere,
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: {
        id: true,
        channel: true,
        status: true,
        dryRun: true,
        skipReason: true,
        attemptNumber: true,
        nextRetryAt: true,
        deadLetteredAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        notificationIntent: {
          select: {
            triggerType: true,
            recipientRole: true,
            event: {
              select: { eventNumber: true },
            },
          },
        },
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: {
        ...attemptWhere,
        status: "skipped",
        OR: [
          { skipReason: { contains: "_missing_" } },
          { skipReason: { endsWith: "_unavailable" } },
        ],
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: {
        ...attemptWhere,
        status: "skipped",
        OR: [
          { skipReason: { endsWith: "_email_disabled" } },
          { skipReason: { endsWith: "_sms_disabled" } },
        ],
      },
    }),
    getSchedulerHealth({ audience: input.audience, scopeWhere }),
    db.preventiveMaintenanceNotificationAuditLog.groupBy({
      by: ["outcome"],
      where: {
        operation: "manual_live_email_pilot",
        createdAt: {
          gte: input.filters.startAt,
          lt: input.filters.endAtExclusive,
        },
        ...(isPmNotificationReportingGlobalScope(input.audience.role)
          ? {}
          : { organizationId: input.audience.organizationId }),
      },
      _count: { _all: true },
      _sum: {
        deliveryAttemptCount: true,
        providerCallCount: true,
      },
    }),
  ]);

  const notificationStatusCounts = emptyNotificationStatusCounts();
  const attemptStatusCounts = emptyAttemptStatusCounts();
  const channelStatusCounts = emptyChannelStatusCounts();
  const manualPilotOutcomeCounts = {
    attempted: 0,
    succeeded: 0,
    completed_with_failures: 0,
    rejected: 0,
    failed: 0,
  };

  for (const notification of notifications) {
    notificationStatusCounts[notification.status] += 1;
  }

  for (const group of attemptGroups) {
    attemptStatusCounts[group.status] += group._count._all;
    channelStatusCounts[group.channel][group.status] += group._count._all;
  }

  for (const group of manualPilotAuditGroups) {
    manualPilotOutcomeCounts[group.outcome] = group._count._all;
  }

  const complianceRows: PmNotificationReportCsvRow[] = notifications.map(
    (notification) => {
      const nextStatusChange = notification.event.timelineEntries.find(
        (entry) => entry.createdAt > notification.createdAt,
      );
      const dismissedAt =
        notification.status === "dismissed" ? notification.updatedAt : null;
      const attempts = countPmNotificationAttemptStatuses(
        notification.deliveryAttempts,
      );

      return {
        notificationId: notification.id,
        eventNumber: notification.event.eventNumber,
        triggerType: notification.triggerType,
        recipientRole: notification.recipientRole,
        notificationStatus: notification.status,
        notificationCreatedAt: notification.createdAt.toISOString(),
        dismissedAt: dismissedAt?.toISOString() ?? null,
        dismissalMinutes: durationMinutes(notification.createdAt, dismissedAt),
        nextPmStatusChange: nextStatusChange?.eventType ?? null,
        nextPmStatusChangedAt:
          nextStatusChange?.createdAt.toISOString() ?? null,
        pmStatusChangeMinutes: durationMinutes(
          notification.createdAt,
          nextStatusChange?.createdAt ?? null,
        ),
        emailQueued: attempts.email.queued,
        emailSending: attempts.email.sending,
        emailSkipped: attempts.email.skipped,
        emailFailed: attempts.email.failed,
        emailSent: attempts.email.sent,
        emailDeadLetter: attempts.email.dead_letter,
        smsQueued: attempts.sms.queued,
        smsSending: attempts.sms.sending,
        smsSkipped: attempts.sms.skipped,
        smsFailed: attempts.sms.failed,
        smsSent: attempts.sms.sent,
        smsDeadLetter: attempts.sms.dead_letter,
      };
    },
  );
  const dismissal = summarizePmNotificationDurations(
    complianceRows.map((row) => row.dismissalMinutes),
  );
  const pmStatusChange = summarizePmNotificationDurations(
    complianceRows.map((row) => row.pmStatusChangeMinutes),
  );
  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: input.filters.startDate,
      endDate: input.filters.endDate,
      status: input.filters.status,
      channel: input.filters.channel,
    },
    scope: {
      role: input.audience.role,
      organizationScoped: !isPmNotificationReportingGlobalScope(
        input.audience.role,
      ),
    },
    funnel: {
      notificationStatusCounts,
      attemptStatusCounts,
      channelStatusCounts,
      totalNotifications: notifications.length,
      totalAttempts: attemptGroups.reduce(
        (total, group) => total + group._count._all,
        0,
      ),
      missingRecipientCount,
      preferenceSuppressedCount,
    },
    responsiveness: {
      dismissal,
      pmStatusChange,
    },
    scheduler,
    manualPilot: {
      batchCount: manualPilotAuditGroups.reduce(
        (total, group) => total + group._count._all,
        0,
      ),
      deliveryAttemptCount: manualPilotAuditGroups.reduce(
        (total, group) => total + (group._sum.deliveryAttemptCount ?? 0),
        0,
      ),
      providerCallCount: manualPilotAuditGroups.reduce(
        (total, group) => total + (group._sum.providerCallCount ?? 0),
        0,
      ),
      outcomeCounts: manualPilotOutcomeCounts,
    },
    recentAttempts: recentAttempts.map((attempt) => ({
      id: attempt.id,
      eventNumber: attempt.notificationIntent.event.eventNumber,
      triggerType: attempt.notificationIntent.triggerType,
      recipientRole: attempt.notificationIntent.recipientRole,
      channel: attempt.channel,
      status: attempt.status,
      dryRun: attempt.dryRun,
      dispatchSource: dispatchSourceFromMetadata(attempt.metadata),
      skipReason: sanitizePmNotificationReportingDiagnostic(attempt.skipReason),
      attemptNumber: attempt.attemptNumber,
      nextRetryAt: attempt.nextRetryAt?.toISOString() ?? null,
      deadLetteredAt: attempt.deadLetteredAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
    })),
    complianceRows,
  };
}

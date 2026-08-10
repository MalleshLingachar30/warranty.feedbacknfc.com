import "server-only";

import { randomUUID } from "node:crypto";

import {
  Prisma,
  type PreventiveMaintenanceNotificationDeliveryChannel,
  type PreventiveMaintenanceNotificationTrigger,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  maskPreventiveMaintenanceDeliveryRecipientAddress,
  serializePreventiveMaintenanceDeliveryAttemptForView,
  type SerializedPreventiveMaintenanceDeliveryAttemptForView,
} from "@/lib/preventive-maintenance-delivery-attempts";
import {
  getPreventiveMaintenanceEmailDeliveryConfiguration,
  getPreventiveMaintenanceEmailDeliveryReadiness,
  sendPreventiveMaintenanceEmailWithResend,
} from "@/lib/preventive-maintenance-email-delivery";
import {
  finishPreventiveMaintenanceNotificationAuditSafely,
  preventiveMaintenanceAuditErrorMessage,
  startPreventiveMaintenanceNotificationAudit,
  startPreventiveMaintenanceNotificationSystemAudit,
} from "@/lib/preventive-maintenance-notification-audit";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-api-error";
import {
  PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP,
  resolvePreventiveMaintenanceManualEmailPilotRequest,
  summarizePreventiveMaintenanceManualEmailPilotRequest,
} from "@/lib/preventive-maintenance-manual-email-pilot-policy";
import {
  getPreventiveMaintenanceNotificationRolePreference,
  isPreventiveMaintenanceMissingRecipientReason,
  isPreventiveMaintenancePreferenceSuppressionReason,
  resolvePreventiveMaintenanceNotificationSuppression,
  type PreventiveMaintenanceNotificationRolePreference,
} from "@/lib/preventive-maintenance-notification-preference-policy";
import { getPreventiveMaintenanceNotificationPreferencesForOrganizations } from "@/lib/preventive-maintenance-notification-preferences";
import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";
import type { AppRole } from "@/lib/roles";
import {
  getPreventiveMaintenanceNextRetryAt,
  PREVENTIVE_MAINTENANCE_DELIVERY_CLAIM_LEASE_MS,
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS,
  resolvePreventiveMaintenanceScheduledAttemptAction,
} from "@/lib/preventive-maintenance-scheduled-dispatch-policy";

export const PREVENTIVE_MAINTENANCE_DELIVERY_CHANNELS = [
  "email",
  "sms",
] as const satisfies readonly PreventiveMaintenanceNotificationDeliveryChannel[];

export type PreventiveMaintenanceDispatchChannel =
  (typeof PREVENTIVE_MAINTENANCE_DELIVERY_CHANNELS)[number];

type DispatchableNotificationIntent =
  Prisma.PreventiveMaintenanceNotificationIntentGetPayload<{
    select: typeof dispatchableNotificationIntentSelect;
  }>;

export type DispatchPreventiveMaintenanceNotificationsInput = {
  audience: PreventiveMaintenanceNotificationAudience;
  channels: PreventiveMaintenanceDispatchChannel[];
  limit: number;
  dryRun: boolean;
  confirmLiveDelivery?: boolean;
  retryFailed?: boolean;
  triggerType?: PreventiveMaintenanceNotificationTrigger | null;
};

export type DispatchPreventiveMaintenanceNotificationsResult = {
  dryRun: boolean;
  channels: PreventiveMaintenanceDispatchChannel[];
  preparedAt: string | null;
  scannedIntentCount: number;
  candidateAttemptCount: number;
  createdAttemptCount: number;
  existingAttemptCount: number;
  missingRecipientCount: number;
  queuedAttemptCount: number;
  sentAttemptCount: number;
  failedAttemptCount: number;
  deadLetteredAttemptCount: number;
  newlyDeadLetteredAttemptCount: number;
  skippedAttemptCount: number;
  retriedAttemptCount: number;
  deferredRetryCount: number;
  reclaimedAttemptCount: number;
  providerCallCount: number;
  preferenceSuppressedCount: number;
  suppressionReasonCounts: Record<string, number>;
  attempts: SerializedPreventiveMaintenanceDeliveryAttempt[];
};

type DeliveryAttemptCreateInput =
  Prisma.PreventiveMaintenanceNotificationDeliveryAttemptCreateManyInput;

type DeliveryAttemptCandidate = {
  createInput: DeliveryAttemptCreateInput;
  title: string;
  message: string;
};

type DispatchExecutionContext =
  | {
      source: "manual";
    }
  | {
      source: "manual_pilot";
    }
  | {
      source: "scheduled";
      scheduledRunId: string;
    };

type ExecutePreventiveMaintenanceNotificationDispatchInput = Omit<
  DispatchPreventiveMaintenanceNotificationsInput,
  "audience"
> & {
  scopeWhere: Prisma.PreventiveMaintenanceNotificationIntentWhereInput;
  executionContext: DispatchExecutionContext;
  expectedIntentCount?: number;
};

type RecipientOrganization = {
  id: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

type RecipientServiceCenter = {
  id: string;
  organizationId: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
};

type DeliveryRecipientDirectory = {
  organizations: Map<string, RecipientOrganization>;
  serviceCenters: Map<string, RecipientServiceCenter>;
  preferencesByOrganization: Map<
    string,
    PreventiveMaintenanceNotificationRolePreference[]
  >;
};

type SerializedPreventiveMaintenanceDeliveryAttempt =
  SerializedPreventiveMaintenanceDeliveryAttemptForView & {
    id: string;
    notificationIntentId: string;
    organizationId: string;
    channel: PreventiveMaintenanceDispatchChannel;
    dedupeKey: string;
  };

const dispatchableNotificationIntentSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceNotificationIntentSelect>()({
    id: true,
    organizationId: true,
    triggerType: true,
    recipientRole: true,
    recipientUserId: true,
    recipientOrganizationId: true,
    recipientServiceCenterId: true,
    title: true,
    message: true,
    recipientUser: {
      select: {
        email: true,
        phone: true,
        organizationId: true,
        isActive: true,
      },
    },
  });

const deliveryAttemptSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceNotificationDeliveryAttemptSelect>()(
    {
      id: true,
      notificationIntentId: true,
      organizationId: true,
      channel: true,
      status: true,
      dryRun: true,
      recipientAddress: true,
      providerMessageId: true,
      errorMessage: true,
      skipReason: true,
      attemptNumber: true,
      dedupeKey: true,
      claimToken: true,
      claimedAt: true,
      claimExpiresAt: true,
      nextRetryAt: true,
      deadLetteredAt: true,
      scheduledRunId: true,
      createdAt: true,
      updatedAt: true,
    },
  );

export function canDispatchPreventiveMaintenanceNotifications(role: AppRole) {
  return (
    role === "platform_owner" ||
    role === "field_super_admin" ||
    role === "field_service_admin" ||
    role === "manufacturer_admin" ||
    role === "service_center_admin" ||
    role === "field_dispatcher"
  );
}

export function parsePreventiveMaintenanceDispatchChannels(value: unknown) {
  if (!Array.isArray(value)) {
    return [...PREVENTIVE_MAINTENANCE_DELIVERY_CHANNELS];
  }

  const channels = value.filter(
    (channel): channel is PreventiveMaintenanceDispatchChannel =>
      PREVENTIVE_MAINTENANCE_DELIVERY_CHANNELS.includes(
        channel as PreventiveMaintenanceDispatchChannel,
      ),
  );

  return [...new Set(channels)];
}

export function parsePreventiveMaintenanceDispatchLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 20;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 20;
  }

  return Math.min(parsed, 50);
}

export async function dispatchPreventiveMaintenanceNotifications(
  input: DispatchPreventiveMaintenanceNotificationsInput,
): Promise<DispatchPreventiveMaintenanceNotificationsResult> {
  if (!canDispatchPreventiveMaintenanceNotifications(input.audience.role)) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  const audit = await startPreventiveMaintenanceNotificationAudit({
    audience: input.audience,
    operation: input.dryRun ? "dry_run_dispatch" : "live_dispatch",
    metadata: {
      channels: input.channels,
      dryRun: input.dryRun,
      limit: input.limit,
      triggerType: input.triggerType ?? null,
      retryFailed: input.retryFailed === true,
      confirmationProvided: input.confirmLiveDelivery === true,
    },
  });

  try {
    if (!input.dryRun) {
      throw new PreventiveMaintenanceNotificationApiError(
        "Generic PM notification dispatch is dry-run only. Use the dedicated manual live email pilot endpoint for reviewed live sends.",
        400,
      );
    }

    const result = await executePreventiveMaintenanceNotificationDispatch({
      ...input,
      scopeWhere: input.audience.where,
      executionContext: { source: "manual" },
    });
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome:
        result.failedAttemptCount > 0 || result.deadLetteredAttemptCount > 0
          ? "completed_with_failures"
          : "succeeded",
      notificationIntentCount: result.scannedIntentCount,
      deliveryAttemptCount: result.candidateAttemptCount,
      providerCallCount: result.providerCallCount,
      metadata: {
        channels: input.channels,
        dryRun: input.dryRun,
        preferenceSuppressedCount: result.preferenceSuppressedCount,
        suppressionReasonCounts: result.suppressionReasonCounts,
        retriedAttemptCount: result.retriedAttemptCount,
        deferredRetryCount: result.deferredRetryCount,
        newlyDeadLetteredAttemptCount: result.newlyDeadLetteredAttemptCount,
      },
    });
    return result;
  } catch (error) {
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome:
        error instanceof PreventiveMaintenanceNotificationApiError &&
        error.status < 500
          ? "rejected"
          : "failed",
      errorMessage: preventiveMaintenanceAuditErrorMessage(error),
    });
    throw error;
  }
}

export async function dispatchPreventiveMaintenanceNotificationsForScheduledRun(
  input: Omit<DispatchPreventiveMaintenanceNotificationsInput, "audience"> & {
    scheduledRunId: string;
  },
) {
  const now = new Date();
  return executePreventiveMaintenanceNotificationDispatch({
    channels: input.channels,
    limit: input.limit,
    dryRun: input.dryRun,
    confirmLiveDelivery: input.confirmLiveDelivery,
    retryFailed: input.retryFailed,
    triggerType: input.triggerType,
    scopeWhere: buildScheduledDispatchScopeWhere({
      dryRun: input.dryRun,
      now,
    }),
    executionContext: {
      source: "scheduled",
      scheduledRunId: input.scheduledRunId,
    },
  });
}

export async function sendPreventiveMaintenanceManualEmailPilot(input: {
  audience: PreventiveMaintenanceNotificationAudience;
  request: unknown;
}) {
  if (!canDispatchPreventiveMaintenanceNotifications(input.audience.role)) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  const requestSummary = summarizePreventiveMaintenanceManualEmailPilotRequest(
    input.request,
  );
  const readiness = getPreventiveMaintenanceEmailDeliveryReadiness();
  const audit = await startPreventiveMaintenanceNotificationAudit({
    audience: input.audience,
    operation: "manual_live_email_pilot",
    channel: "email",
    metadata: {
      provider: readiness.provider,
      liveEmailStatus: readiness.liveEmail.status,
      batchCap: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP,
      ...requestSummary,
    },
  });

  try {
    const resolution = resolvePreventiveMaintenanceManualEmailPilotRequest(
      input.request,
    );
    if (!resolution.ok) {
      throw new PreventiveMaintenanceNotificationApiError(
        resolution.error,
        resolution.status,
      );
    }

    if (readiness.liveEmail.status !== "ready") {
      const blockingConfiguration =
        readiness.liveEmail.status === "disabled"
          ? "PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED"
          : readiness.liveEmail.missingConfiguration.join(", ");
      throw new PreventiveMaintenanceNotificationApiError(
        `Manual live email pilot is not ready: ${blockingConfiguration}.`,
        409,
      );
    }

    const notificationIds = resolution.request.notificationIds;
    const reviewedNotifications =
      await db.preventiveMaintenanceNotificationIntent.findMany({
        where: {
          AND: [
            input.audience.where,
            {
              id: { in: notificationIds },
              channel: "in_app",
              status: "pending",
            },
          ],
        },
        select: {
          id: true,
          deliveryAttempts: {
            where: {
              channel: "email",
              dryRun: true,
            },
            orderBy: {
              updatedAt: "desc",
            },
            take: 1,
            select: {
              updatedAt: true,
            },
          },
        },
      });

    if (reviewedNotifications.length !== notificationIds.length) {
      throw new PreventiveMaintenanceNotificationApiError(
        "The manual pilot selection must contain only exact, pending notifications in the operator's authorized scope.",
        409,
      );
    }

    const missingDryRunReviewCount = reviewedNotifications.filter(
      (notification) => notification.deliveryAttempts.length === 0,
    ).length;
    if (missingDryRunReviewCount > 0) {
      throw new PreventiveMaintenanceNotificationApiError(
        `Run and review an email delivery dry run for every selected notification before live delivery. ${missingDryRunReviewCount} selected notification${missingDryRunReviewCount === 1 ? " is" : "s are"} missing dry-run diagnostics.`,
        409,
      );
    }

    const result = await executePreventiveMaintenanceNotificationDispatch({
      channels: ["email"],
      limit: notificationIds.length,
      dryRun: false,
      confirmLiveDelivery: true,
      retryFailed: false,
      triggerType: null,
      scopeWhere: {
        AND: [
          input.audience.where,
          {
            id: {
              in: notificationIds,
            },
          },
        ],
      },
      executionContext: { source: "manual_pilot" },
      expectedIntentCount: notificationIds.length,
    });

    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome:
        result.failedAttemptCount > 0 || result.deadLetteredAttemptCount > 0
          ? "completed_with_failures"
          : "succeeded",
      notificationIntentCount: result.scannedIntentCount,
      deliveryAttemptCount: result.candidateAttemptCount,
      providerCallCount: result.providerCallCount,
      metadata: {
        mode: "manual_live_email_pilot",
        confirmationProvided: true,
        selectedNotificationCount: notificationIds.length,
        sentAttemptCount: result.sentAttemptCount,
        failedAttemptCount: result.failedAttemptCount,
        skippedAttemptCount: result.skippedAttemptCount,
        missingRecipientCount: result.missingRecipientCount,
        preferenceSuppressedCount: result.preferenceSuppressedCount,
        suppressionReasonCounts: result.suppressionReasonCounts,
      },
    });

    return {
      ok: true as const,
      mode: "manual_live_email_pilot" as const,
      auditId: audit.id,
      completedAt: new Date().toISOString(),
      selectedNotificationCount: notificationIds.length,
      scannedIntentCount: result.scannedIntentCount,
      candidateAttemptCount: result.candidateAttemptCount,
      createdAttemptCount: result.createdAttemptCount,
      existingAttemptCount: result.existingAttemptCount,
      sentAttemptCount: result.sentAttemptCount,
      failedAttemptCount: result.failedAttemptCount,
      skippedAttemptCount: result.skippedAttemptCount,
      missingRecipientCount: result.missingRecipientCount,
      preferenceSuppressedCount: result.preferenceSuppressedCount,
      providerCallCount: result.providerCallCount,
      suppressionReasonCounts: result.suppressionReasonCounts,
      attempts: result.attempts.map((attempt) => ({
        id: attempt.id,
        notificationIntentId: attempt.notificationIntentId,
        channel: attempt.channel,
        status: attempt.status,
        recipientAddressMasked: attempt.recipientAddressMasked,
        hasRecipientAddress: attempt.hasRecipientAddress,
        errorMessage: attempt.errorMessage,
        skipReason: attempt.skipReason,
        attemptNumber: attempt.attemptNumber,
        updatedAt: attempt.updatedAt,
      })),
    };
  } catch (error) {
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome:
        error instanceof PreventiveMaintenanceNotificationApiError &&
        error.status < 500
          ? "rejected"
          : "failed",
      errorMessage: preventiveMaintenanceAuditErrorMessage(error),
      metadata: {
        mode: "manual_live_email_pilot",
        provider: readiness.provider,
        liveEmailStatus: readiness.liveEmail.status,
        batchCap: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP,
        ...requestSummary,
      },
    });
    throw error;
  }
}

function buildScheduledDispatchScopeWhere(input: {
  dryRun: boolean;
  now: Date;
}): Prisma.PreventiveMaintenanceNotificationIntentWhereInput {
  const modeAttemptWhere: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptWhereInput =
    {
      channel: "email",
      dryRun: input.dryRun,
    };

  if (input.dryRun) {
    return {
      deliveryAttempts: {
        none: modeAttemptWhere,
      },
    };
  }

  return {
    OR: [
      {
        deliveryAttempts: {
          none: modeAttemptWhere,
        },
      },
      {
        deliveryAttempts: {
          some: {
            ...modeAttemptWhere,
            status: "queued",
          },
        },
      },
      {
        deliveryAttempts: {
          some: {
            ...modeAttemptWhere,
            status: "failed",
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: input.now } }],
          },
        },
      },
      {
        deliveryAttempts: {
          some: {
            ...modeAttemptWhere,
            status: "sending",
            OR: [
              { claimExpiresAt: null },
              { claimExpiresAt: { lte: input.now } },
            ],
          },
        },
      },
      {
        deliveryAttempts: {
          some: {
            ...modeAttemptWhere,
            status: "skipped",
            skipReason: {
              in: [
                "email_delivery_disabled",
                "missing_resend_api_key",
                "missing_resend_from_email",
                "invalid_resend_from_email",
              ],
            },
          },
        },
      },
    ],
  };
}

async function executePreventiveMaintenanceNotificationDispatch(
  input: ExecutePreventiveMaintenanceNotificationDispatchInput,
): Promise<DispatchPreventiveMaintenanceNotificationsResult> {
  if (input.channels.length === 0) {
    throw new PreventiveMaintenanceNotificationApiError(
      "At least one delivery channel is required.",
      400,
    );
  }

  validateDispatchMode(input);

  const where: Prisma.PreventiveMaintenanceNotificationIntentWhereInput = {
    ...input.scopeWhere,
    channel: "in_app",
    status: "pending",
    ...(input.triggerType ? { triggerType: input.triggerType } : {}),
  };

  const intents = await db.preventiveMaintenanceNotificationIntent.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
    take: input.limit,
    select: dispatchableNotificationIntentSelect,
  });

  if (
    input.expectedIntentCount !== undefined &&
    intents.length !== input.expectedIntentCount
  ) {
    throw new PreventiveMaintenanceNotificationApiError(
      "The reviewed manual pilot batch changed before delivery. Refresh, review, and confirm the exact pending selection again.",
      409,
    );
  }

  const recipientDirectory = await loadDeliveryRecipientDirectory(intents);
  const emailConfiguration =
    getPreventiveMaintenanceEmailDeliveryConfiguration();

  const candidates = buildDeliveryAttemptCandidates({
    channels: input.channels,
    dryRun: input.dryRun,
    intents,
    recipientDirectory,
    emailDeliverySkipReason: emailConfiguration.enabled
      ? null
      : emailConfiguration.skipReason,
    scheduledRunId:
      input.executionContext.source === "scheduled"
        ? input.executionContext.scheduledRunId
        : null,
  });
  const createInputs = candidates.map((candidate) => candidate.createInput);

  const createResult =
    createInputs.length > 0
      ? await db.preventiveMaintenanceNotificationDeliveryAttempt.createMany({
          data: createInputs,
          skipDuplicates: true,
        })
      : { count: 0 };
  const preparedAt =
    input.dryRun && createInputs.length > 0 ? new Date() : null;

  await reconcilePreflightDeliveryAttempts({
    candidates,
    preparedAt,
  });

  const attempts =
    createInputs.length > 0
      ? await db.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
          where: {
            OR: buildDeliveryAttemptLookupWhere({
              createInputs,
              retryFailed: input.retryFailed === true,
            }),
          },
          orderBy: [
            {
              createdAt: "asc",
            },
            {
              channel: "asc",
            },
          ],
          select: deliveryAttemptSelect,
        })
      : [];

  let dispatchResult = {
    providerCallCount: 0,
    retriedAttemptCount: 0,
    deferredRetryCount: 0,
    reclaimedAttemptCount: 0,
    newlyDeadLetteredAttemptCount: 0,
  };

  if (!input.dryRun && attempts.length > 0) {
    dispatchResult = await dispatchEligibleEmailAttempts({
      attempts,
      candidates,
      retryFailed: input.retryFailed === true,
      executionContext: input.executionContext,
    });
  }

  const finalAttempts =
    createInputs.length > 0
      ? await db.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
          where: {
            OR: buildDeliveryAttemptLookupWhere({
              createInputs,
              retryFailed: input.retryFailed === true,
            }),
          },
          orderBy: [
            {
              createdAt: "asc",
            },
            {
              channel: "asc",
            },
          ],
          select: deliveryAttemptSelect,
        })
      : [];
  const statusCounts = countAttemptStatuses(finalAttempts);
  const suppressionReasonCounts = countSuppressionReasons(finalAttempts);

  return {
    dryRun: input.dryRun,
    channels: input.channels,
    preparedAt: preparedAt?.toISOString() ?? null,
    scannedIntentCount: intents.length,
    candidateAttemptCount: createInputs.length,
    createdAttemptCount: createResult.count,
    existingAttemptCount: Math.max(0, createInputs.length - createResult.count),
    missingRecipientCount: finalAttempts.filter((attempt) =>
      isPreventiveMaintenanceMissingRecipientReason(attempt.skipReason),
    ).length,
    queuedAttemptCount: statusCounts.queued,
    sentAttemptCount: statusCounts.sent,
    failedAttemptCount: statusCounts.failed,
    deadLetteredAttemptCount: statusCounts.dead_letter,
    newlyDeadLetteredAttemptCount: dispatchResult.newlyDeadLetteredAttemptCount,
    skippedAttemptCount: statusCounts.skipped,
    retriedAttemptCount: dispatchResult.retriedAttemptCount,
    deferredRetryCount: dispatchResult.deferredRetryCount,
    reclaimedAttemptCount: dispatchResult.reclaimedAttemptCount,
    providerCallCount: dispatchResult.providerCallCount,
    preferenceSuppressedCount: finalAttempts.filter((attempt) =>
      isPreventiveMaintenancePreferenceSuppressionReason(attempt.skipReason),
    ).length,
    suppressionReasonCounts,
    attempts: finalAttempts.map(serializeDeliveryAttempt),
  };
}

export async function dispatchPreventiveMaintenanceNotificationsDryRun(
  input: Omit<DispatchPreventiveMaintenanceNotificationsInput, "dryRun"> & {
    dryRun: true;
  },
) {
  return dispatchPreventiveMaintenanceNotifications(input);
}

function validateDispatchMode(
  input: Pick<
    ExecutePreventiveMaintenanceNotificationDispatchInput,
    "dryRun" | "confirmLiveDelivery" | "channels"
  >,
) {
  if (input.dryRun) {
    return;
  }

  if (input.confirmLiveDelivery !== true) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Live delivery requires confirmLiveDelivery: true.",
      400,
    );
  }

  const unsupportedChannels = input.channels.filter(
    (channel) => channel !== "email",
  );
  if (unsupportedChannels.length > 0) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Live SMS delivery is unsupported. Confirmed live delivery accepts email only.",
      400,
    );
  }
}

function buildDeliveryAttemptCandidates(input: {
  intents: DispatchableNotificationIntent[];
  channels: PreventiveMaintenanceDispatchChannel[];
  dryRun: boolean;
  recipientDirectory: DeliveryRecipientDirectory;
  emailDeliverySkipReason: string | null;
  scheduledRunId: string | null;
}): DeliveryAttemptCandidate[] {
  return input.intents.flatMap((intent) =>
    input.channels.map((channel) => {
      const recipient = resolveDeliveryRecipient({
        intent,
        directory: input.recipientDirectory,
        channel,
      });
      const preferences =
        input.recipientDirectory.preferencesByOrganization.get(
          recipient.preferenceOrganizationId,
        ) ?? [];
      const preference = getPreventiveMaintenanceNotificationRolePreference(
        preferences,
        intent.recipientRole,
      );
      const skipReason = resolvePreventiveMaintenanceNotificationSuppression({
        recipientRole: intent.recipientRole,
        channel,
        dryRun: input.dryRun,
        preference,
        recipientAvailable: recipient.available,
        recipientAddress: recipient.address,
        emailDeliverySkipReason: input.emailDeliverySkipReason,
      });

      return {
        createInput: {
          notificationIntentId: intent.id,
          organizationId: intent.organizationId,
          channel,
          status: skipReason ? "skipped" : "queued",
          dryRun: input.dryRun,
          recipientAddress: recipient.address,
          skipReason,
          attemptNumber: 1,
          scheduledRunId: input.scheduledRunId,
          dedupeKey: buildDeliveryAttemptDedupeKey({
            notificationIntentId: intent.id,
            channel,
            dryRun: input.dryRun,
          }),
          metadata: {
            dryRun: input.dryRun,
            triggerType: intent.triggerType,
            recipientRole: intent.recipientRole,
            preferenceOrganizationId: recipient.preferenceOrganizationId,
            preferenceSource: preference.source,
            preferenceChannelEnabled:
              channel === "email"
                ? preference.emailEnabled
                : preference.smsEnabled,
            title: intent.title,
          },
        },
        title: intent.title,
        message: intent.message,
      };
    }),
  );
}

function resolveDeliveryRecipient(input: {
  intent: DispatchableNotificationIntent;
  directory: DeliveryRecipientDirectory;
  channel: PreventiveMaintenanceDispatchChannel;
}) {
  const intent = input.intent;
  const serviceCenter = intent.recipientServiceCenterId
    ? input.directory.serviceCenters.get(intent.recipientServiceCenterId)
    : null;
  const recipientOrganizationId = resolvePreferenceOrganizationId({
    intent,
    serviceCenter,
  });
  const recipientOrganization = input.directory.organizations.get(
    recipientOrganizationId,
  );
  const userAddress =
    input.channel === "email"
      ? intent.recipientUser?.email
      : intent.recipientUser?.phone;
  const serviceCenterAddress =
    input.channel === "email" ? serviceCenter?.email : serviceCenter?.phone;
  const organizationAddress =
    input.channel === "email"
      ? recipientOrganization?.contactEmail
      : recipientOrganization?.contactPhone;

  switch (intent.recipientRole) {
    case "customer":
    case "technician":
      return {
        address: userAddress ?? null,
        available: intent.recipientUser?.isActive === true,
        preferenceOrganizationId: recipientOrganizationId,
      };
    case "service_center":
      return {
        address:
          userAddress ?? serviceCenterAddress ?? organizationAddress ?? null,
        available:
          intent.recipientUser?.isActive === true ||
          serviceCenter?.isActive === true ||
          Boolean(recipientOrganization),
        preferenceOrganizationId: recipientOrganizationId,
      };
    case "manufacturer":
      return {
        address: userAddress ?? organizationAddress ?? null,
        available: intent.recipientUserId
          ? intent.recipientUser?.isActive === true
          : Boolean(recipientOrganization),
        preferenceOrganizationId: recipientOrganizationId,
      };
    default:
      return {
        address: null,
        available: false,
        preferenceOrganizationId: recipientOrganizationId,
      };
  }
}

function resolvePreferenceOrganizationId(input: {
  intent: DispatchableNotificationIntent;
  serviceCenter: RecipientServiceCenter | null | undefined;
}) {
  switch (input.intent.recipientRole) {
    case "service_center":
      return (
        input.intent.recipientOrganizationId ??
        input.serviceCenter?.organizationId ??
        input.intent.organizationId
      );
    case "technician":
      return (
        input.intent.recipientUser?.organizationId ??
        input.serviceCenter?.organizationId ??
        input.intent.organizationId
      );
    case "manufacturer":
      return (
        input.intent.recipientOrganizationId ??
        input.intent.recipientUser?.organizationId ??
        input.intent.organizationId
      );
    case "customer":
    default:
      return input.intent.organizationId;
  }
}

async function loadDeliveryRecipientDirectory(
  intents: DispatchableNotificationIntent[],
): Promise<DeliveryRecipientDirectory> {
  const serviceCenterIds = [
    ...new Set(
      intents.flatMap((intent) =>
        intent.recipientServiceCenterId
          ? [intent.recipientServiceCenterId]
          : [],
      ),
    ),
  ];
  const serviceCenters =
    serviceCenterIds.length > 0
      ? await db.serviceCenter.findMany({
          where: { id: { in: serviceCenterIds } },
          select: {
            id: true,
            organizationId: true,
            email: true,
            phone: true,
            isActive: true,
          },
        })
      : [];
  const serviceCenterById = new Map(
    serviceCenters.map((serviceCenter) => [serviceCenter.id, serviceCenter]),
  );
  const organizationIds = [
    ...new Set(
      intents.flatMap((intent) => {
        const serviceCenter = intent.recipientServiceCenterId
          ? serviceCenterById.get(intent.recipientServiceCenterId)
          : null;

        return [
          intent.organizationId,
          intent.recipientOrganizationId,
          intent.recipientUser?.organizationId,
          serviceCenter?.organizationId,
        ].filter((organizationId): organizationId is string =>
          Boolean(organizationId),
        );
      }),
    ),
  ];
  const [organizations, preferencesByOrganization] = await Promise.all([
    organizationIds.length > 0
      ? db.organization.findMany({
          where: { id: { in: organizationIds } },
          select: {
            id: true,
            contactEmail: true,
            contactPhone: true,
          },
        })
      : Promise.resolve([]),
    getPreventiveMaintenanceNotificationPreferencesForOrganizations(
      organizationIds,
    ),
  ]);

  return {
    organizations: new Map(
      organizations.map((organization) => [organization.id, organization]),
    ),
    serviceCenters: serviceCenterById,
    preferencesByOrganization,
  };
}

async function reconcilePreflightDeliveryAttempts(input: {
  candidates: DeliveryAttemptCandidate[];
  preparedAt: Date | null;
}) {
  if (input.candidates.length === 0) {
    return;
  }

  await db.$transaction(
    input.candidates.flatMap((candidate) => [
      db.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
        where: {
          dedupeKey: candidate.createInput.dedupeKey,
          status: { in: ["skipped", "queued"] },
          providerMessageId: null,
        },
        data: {
          status: candidate.createInput.status ?? "queued",
          recipientAddress: candidate.createInput.recipientAddress ?? null,
          skipReason: candidate.createInput.skipReason ?? null,
          scheduledRunId: candidate.createInput.scheduledRunId ?? null,
          metadata: candidate.createInput.metadata ?? {},
          ...(input.preparedAt ? { updatedAt: input.preparedAt } : {}),
        },
      }),
      ...(candidate.createInput.status === "skipped"
        ? [
            db.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
              where: {
                dedupeKey: candidate.createInput.dedupeKey,
                status: "failed",
                providerMessageId: null,
              },
              data: {
                status: "skipped",
                recipientAddress:
                  candidate.createInput.recipientAddress ?? null,
                skipReason: candidate.createInput.skipReason ?? null,
                nextRetryAt: null,
                claimToken: null,
                claimedAt: null,
                claimExpiresAt: null,
                scheduledRunId: candidate.createInput.scheduledRunId ?? null,
                metadata: candidate.createInput.metadata ?? {},
              },
            }),
          ]
        : []),
    ]),
  );
}

function buildDeliveryAttemptDedupeKey(input: {
  notificationIntentId: string;
  channel: PreventiveMaintenanceDispatchChannel;
  dryRun: boolean;
}) {
  const mode = input.dryRun ? "dry-run" : "send:v1";
  return `pm-delivery:${input.notificationIntentId}:${input.channel}:${mode}`;
}

function buildDeliveryAttemptLookupWhere(input: {
  createInputs: DeliveryAttemptCreateInput[];
  retryFailed: boolean;
}): Prisma.PreventiveMaintenanceNotificationDeliveryAttemptWhereInput[] {
  const dedupeKeys = input.createInputs.map((attempt) => attempt.dedupeKey);
  const where: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptWhereInput[] =
    [
      {
        dedupeKey: {
          in: dedupeKeys,
        },
      },
    ];

  if (input.retryFailed) {
    where.push({
      status: "failed",
      dryRun: false,
      channel: "email",
      dedupeKey: {
        in: dedupeKeys,
      },
    });
  }

  return where;
}

async function dispatchEligibleEmailAttempts(input: {
  attempts: Array<
    Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
      select: typeof deliveryAttemptSelect;
    }>
  >;
  candidates: DeliveryAttemptCandidate[];
  retryFailed: boolean;
  executionContext: DispatchExecutionContext;
}) {
  const candidatesByDedupeKey = new Map(
    input.candidates.map((candidate) => [
      candidate.createInput.dedupeKey,
      candidate,
    ]),
  );
  let providerCallCount = 0;
  let retriedAttemptCount = 0;
  let deferredRetryCount = 0;
  let reclaimedAttemptCount = 0;
  let newlyDeadLetteredAttemptCount = 0;

  for (const attempt of input.attempts) {
    if (
      attempt.dryRun ||
      attempt.channel !== "email" ||
      ((attempt.status === "failed" || attempt.status === "sending") &&
        !input.retryFailed)
    ) {
      continue;
    }

    const candidate = candidatesByDedupeKey.get(attempt.dedupeKey);
    const currentRecipientAddress = candidate?.createInput.recipientAddress;
    if (
      !candidate ||
      candidate.createInput.status !== "queued" ||
      typeof currentRecipientAddress !== "string" ||
      !currentRecipientAddress
    ) {
      continue;
    }

    const now = new Date();
    const action = resolvePreventiveMaintenanceScheduledAttemptAction({
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      nextRetryAt: attempt.nextRetryAt,
      claimExpiresAt: attempt.claimExpiresAt,
      now,
    });

    if (action.action === "defer_retry") {
      deferredRetryCount += 1;
      continue;
    }

    if (action.action === "dead_letter") {
      const deadLetter =
        await db.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
          where: {
            id: attempt.id,
            status: "failed",
            attemptNumber: attempt.attemptNumber,
          },
          data: {
            status: "dead_letter",
            nextRetryAt: null,
            deadLetteredAt: now,
            scheduledRunId:
              input.executionContext.source === "scheduled"
                ? input.executionContext.scheduledRunId
                : attempt.scheduledRunId,
          },
        });

      if (deadLetter.count === 1) {
        newlyDeadLetteredAttemptCount += 1;
        await auditScheduledAttemptDecision({
          executionContext: input.executionContext,
          attempt,
          recipientAddress: currentRecipientAddress,
          outcome: "completed_with_failures",
          errorMessage: attempt.errorMessage,
          metadata: {
            decision: "dead_letter",
            attemptNumber: attempt.attemptNumber,
            maxAttempts: PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS,
          },
        });
      }
      continue;
    }

    if (action.action !== "claim") {
      continue;
    }

    const claimToken = randomUUID();
    const claim = await claimEmailAttemptForDispatch({
      attempt,
      action,
      claimToken,
      now,
      recipientAddress: currentRecipientAddress,
      executionContext: input.executionContext,
    });

    if (claim.count !== 1) {
      continue;
    }

    if (action.retrying) {
      retriedAttemptCount += 1;
    }
    if (action.reclaimingExpiredClaim) {
      reclaimedAttemptCount += 1;
    }
    providerCallCount += 1;

    const scheduledRunId =
      input.executionContext.source === "scheduled"
        ? input.executionContext.scheduledRunId
        : null;
    const attemptAudit = scheduledRunId
      ? await startPreventiveMaintenanceNotificationSystemAudit({
          organizationId: attempt.organizationId,
          operation: "scheduled_delivery_attempt",
          channel: "email",
          recipientAddressMasked:
            maskPreventiveMaintenanceDeliveryRecipientAddress(
              currentRecipientAddress,
              "email",
            ),
          metadata: {
            scheduledRunId,
            deliveryAttemptId: attempt.id,
            attemptNumber: action.nextAttemptNumber,
            retried: action.retrying,
            reclaimedExpiredClaim: action.reclaimingExpiredClaim,
          },
        })
      : null;

    const deliveryResult = await sendPreventiveMaintenanceEmailWithResend({
      to: currentRecipientAddress,
      subject: candidate.title,
      text: candidate.message,
      idempotencyKey: buildProviderIdempotencyKey({
        dedupeKey: attempt.dedupeKey,
        attemptNumber: action.nextAttemptNumber,
      }),
    });

    const shouldDeadLetter =
      !deliveryResult.ok &&
      action.nextAttemptNumber >=
        PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS;
    const nextRetryAt =
      !deliveryResult.ok && !shouldDeadLetter
        ? getPreventiveMaintenanceNextRetryAt({
            now: new Date(),
            failedAttemptNumber: action.nextAttemptNumber,
          })
        : null;

    const completion =
      await db.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
        where: {
          id: attempt.id,
          status: "sending",
          claimToken,
        },
        data: deliveryResult.ok
          ? {
              status: "sent",
              providerMessageId: deliveryResult.providerMessageId,
              providerResponse: deliveryResult.providerResponse,
              errorMessage: null,
              skipReason: null,
              claimToken: null,
              claimedAt: null,
              claimExpiresAt: null,
              nextRetryAt: null,
              deadLetteredAt: null,
              metadata: {
                deliveryMode: "live",
                provider: "resend",
                dispatchSource: input.executionContext.source,
                retried: action.retrying,
                reclaimedExpiredClaim: action.reclaimingExpiredClaim,
                attemptNumber: action.nextAttemptNumber,
              },
            }
          : {
              status: shouldDeadLetter ? "dead_letter" : "failed",
              providerResponse:
                deliveryResult.providerResponse ?? Prisma.JsonNull,
              errorMessage: deliveryResult.errorMessage,
              skipReason: null,
              claimToken: null,
              claimedAt: null,
              claimExpiresAt: null,
              nextRetryAt,
              deadLetteredAt: shouldDeadLetter ? new Date() : null,
              metadata: {
                deliveryMode: "live",
                provider: "resend",
                dispatchSource: input.executionContext.source,
                retried: action.retrying,
                reclaimedExpiredClaim: action.reclaimingExpiredClaim,
                attemptNumber: action.nextAttemptNumber,
                retryScheduledFor: nextRetryAt?.toISOString() ?? null,
                deadLettered: shouldDeadLetter,
                failureCategory: classifyDeliveryFailure(
                  deliveryResult.errorMessage,
                ),
              },
            },
      });

    if (completion.count === 1 && shouldDeadLetter) {
      newlyDeadLetteredAttemptCount += 1;
    }

    if (attemptAudit && scheduledRunId) {
      await finishPreventiveMaintenanceNotificationAuditSafely({
        auditId: attemptAudit.id,
        outcome: deliveryResult.ok ? "succeeded" : "completed_with_failures",
        deliveryAttemptCount: 1,
        providerCallCount: 1,
        providerMessageId: deliveryResult.ok
          ? deliveryResult.providerMessageId
          : null,
        errorMessage: deliveryResult.ok ? null : deliveryResult.errorMessage,
        metadata: {
          scheduledRunId,
          deliveryAttemptId: attempt.id,
          attemptNumber: action.nextAttemptNumber,
          retried: action.retrying,
          reclaimedExpiredClaim: action.reclaimingExpiredClaim,
          completionRecorded: completion.count === 1,
          decision: deliveryResult.ok
            ? "sent"
            : shouldDeadLetter
              ? "dead_letter"
              : "retry_scheduled",
          nextRetryAt: nextRetryAt?.toISOString() ?? null,
        },
      });
    }
  }

  return {
    providerCallCount,
    retriedAttemptCount,
    deferredRetryCount,
    reclaimedAttemptCount,
    newlyDeadLetteredAttemptCount,
  };
}

function claimEmailAttemptForDispatch(input: {
  attempt: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
    select: typeof deliveryAttemptSelect;
  }>;
  action: Extract<
    ReturnType<typeof resolvePreventiveMaintenanceScheduledAttemptAction>,
    { action: "claim" }
  >;
  claimToken: string;
  now: Date;
  recipientAddress: string;
  executionContext: DispatchExecutionContext;
}) {
  return db.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
    where: {
      id: input.attempt.id,
      status: input.attempt.status,
      attemptNumber: input.attempt.attemptNumber,
      dryRun: false,
      channel: "email",
      ...(input.attempt.status === "sending"
        ? {
            OR: [
              { claimExpiresAt: null },
              {
                claimExpiresAt: {
                  lte: input.now,
                },
              },
            ],
          }
        : {}),
      ...(input.attempt.status === "failed"
        ? {
            OR: [
              { nextRetryAt: null },
              {
                nextRetryAt: {
                  lte: input.now,
                },
              },
            ],
          }
        : {}),
    },
    data: {
      status: "sending",
      attemptNumber: input.action.nextAttemptNumber,
      recipientAddress: input.recipientAddress,
      errorMessage: null,
      skipReason: null,
      providerResponse: Prisma.JsonNull,
      claimToken: input.claimToken,
      claimedAt: input.now,
      claimExpiresAt: new Date(
        input.now.getTime() + PREVENTIVE_MAINTENANCE_DELIVERY_CLAIM_LEASE_MS,
      ),
      nextRetryAt: null,
      deadLetteredAt: null,
      scheduledRunId:
        input.executionContext.source === "scheduled"
          ? input.executionContext.scheduledRunId
          : input.attempt.scheduledRunId,
    },
  });
}

async function auditScheduledAttemptDecision(input: {
  executionContext: DispatchExecutionContext;
  attempt: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
    select: typeof deliveryAttemptSelect;
  }>;
  recipientAddress: string;
  outcome: "succeeded" | "completed_with_failures";
  errorMessage: string | null;
  metadata: Prisma.InputJsonObject;
}) {
  if (input.executionContext.source !== "scheduled") {
    return;
  }

  const audit = await startPreventiveMaintenanceNotificationSystemAudit({
    organizationId: input.attempt.organizationId,
    operation: "scheduled_delivery_attempt",
    channel: "email",
    recipientAddressMasked: maskPreventiveMaintenanceDeliveryRecipientAddress(
      input.recipientAddress,
      "email",
    ),
    metadata: {
      scheduledRunId: input.executionContext.scheduledRunId,
      deliveryAttemptId: input.attempt.id,
    },
  });

  await finishPreventiveMaintenanceNotificationAuditSafely({
    auditId: audit.id,
    outcome: input.outcome,
    deliveryAttemptCount: 1,
    providerCallCount: 0,
    errorMessage: input.errorMessage,
    metadata: {
      scheduledRunId: input.executionContext.scheduledRunId,
      deliveryAttemptId: input.attempt.id,
      ...input.metadata,
    },
  });
}

function buildProviderIdempotencyKey(input: {
  dedupeKey: string;
  attemptNumber: number;
}) {
  return `${input.dedupeKey}:attempt:${input.attemptNumber}`;
}

function classifyDeliveryFailure(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("disabled")) {
    return "provider_disabled";
  }

  if (normalized.includes("missing")) {
    return "provider_configuration_missing";
  }

  if (normalized.includes("status")) {
    return "provider_rejected";
  }

  return "provider_request_failed";
}

function countAttemptStatuses(
  attempts: Array<
    Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
      select: typeof deliveryAttemptSelect;
    }>
  >,
) {
  return attempts.reduce(
    (counts, attempt) => {
      counts[attempt.status] += 1;
      return counts;
    },
    {
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      dead_letter: 0,
      skipped: 0,
    },
  );
}

function countSuppressionReasons(
  attempts: Array<
    Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
      select: typeof deliveryAttemptSelect;
    }>
  >,
) {
  return attempts.reduce<Record<string, number>>((counts, attempt) => {
    if (attempt.skipReason) {
      counts[attempt.skipReason] = (counts[attempt.skipReason] ?? 0) + 1;
    }

    return counts;
  }, {});
}

function serializeDeliveryAttempt(
  attempt: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
    select: typeof deliveryAttemptSelect;
  }>,
): SerializedPreventiveMaintenanceDeliveryAttempt {
  const serializedForView =
    serializePreventiveMaintenanceDeliveryAttemptForView(attempt);

  return {
    ...serializedForView,
    notificationIntentId: attempt.notificationIntentId,
    organizationId: attempt.organizationId,
    dedupeKey: attempt.dedupeKey,
  };
}

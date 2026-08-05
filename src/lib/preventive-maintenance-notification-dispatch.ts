import "server-only";

import {
  Prisma,
  type PreventiveMaintenanceNotificationDeliveryChannel,
  type PreventiveMaintenanceNotificationTrigger,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  serializePreventiveMaintenanceDeliveryAttemptForView,
  type SerializedPreventiveMaintenanceDeliveryAttemptForView,
} from "@/lib/preventive-maintenance-delivery-attempts";
import {
  getPreventiveMaintenanceEmailDeliveryConfiguration,
  sendPreventiveMaintenanceEmailWithResend,
} from "@/lib/preventive-maintenance-email-delivery";
import {
  finishPreventiveMaintenanceNotificationAuditSafely,
  preventiveMaintenanceAuditErrorMessage,
  startPreventiveMaintenanceNotificationAudit,
} from "@/lib/preventive-maintenance-notification-audit";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-api-error";
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
  skippedAttemptCount: number;
  retriedAttemptCount: number;
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
    const result =
      await executePreventiveMaintenanceNotificationDispatch(input);
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome:
        result.failedAttemptCount > 0 ? "completed_with_failures" : "succeeded",
      notificationIntentCount: result.scannedIntentCount,
      deliveryAttemptCount: result.candidateAttemptCount,
      providerCallCount: result.providerCallCount,
      metadata: {
        channels: input.channels,
        dryRun: input.dryRun,
        preferenceSuppressedCount: result.preferenceSuppressedCount,
        suppressionReasonCounts: result.suppressionReasonCounts,
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

async function executePreventiveMaintenanceNotificationDispatch(
  input: DispatchPreventiveMaintenanceNotificationsInput,
): Promise<DispatchPreventiveMaintenanceNotificationsResult> {
  if (!canDispatchPreventiveMaintenanceNotifications(input.audience.role)) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  if (input.channels.length === 0) {
    throw new PreventiveMaintenanceNotificationApiError(
      "At least one delivery channel is required.",
      400,
    );
  }

  validateDispatchMode(input);

  const where: Prisma.PreventiveMaintenanceNotificationIntentWhereInput = {
    ...input.audience.where,
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
  };

  if (!input.dryRun && attempts.length > 0) {
    dispatchResult = await dispatchEligibleEmailAttempts({
      attempts,
      candidates,
      retryFailed: input.retryFailed === true,
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
    skippedAttemptCount: statusCounts.skipped,
    retriedAttemptCount: dispatchResult.retriedAttemptCount,
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
  input: DispatchPreventiveMaintenanceNotificationsInput,
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
    input.candidates.map((candidate) =>
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
          metadata: candidate.createInput.metadata ?? {},
          ...(input.preparedAt ? { updatedAt: input.preparedAt } : {}),
        },
      }),
    ),
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
}) {
  const candidatesByDedupeKey = new Map(
    input.candidates.map((candidate) => [
      candidate.createInput.dedupeKey,
      candidate,
    ]),
  );
  let providerCallCount = 0;
  let retriedAttemptCount = 0;

  for (const attempt of input.attempts) {
    if (
      attempt.dryRun ||
      attempt.channel !== "email" ||
      (attempt.status !== "queued" &&
        !(input.retryFailed && attempt.status === "failed"))
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

    const retrying = attempt.status === "failed";
    const nextAttemptNumber = retrying
      ? Math.min(attempt.attemptNumber + 1, 99)
      : attempt.attemptNumber;
    const claim = await claimEmailAttemptForDispatch({
      attemptId: attempt.id,
      currentStatus: attempt.status,
      nextAttemptNumber,
      recipientAddress: currentRecipientAddress,
    });

    if (claim.count !== 1) {
      continue;
    }

    if (retrying) {
      retriedAttemptCount += 1;
    }
    providerCallCount += 1;

    const deliveryResult = await sendPreventiveMaintenanceEmailWithResend({
      to: currentRecipientAddress,
      subject: candidate.title,
      text: candidate.message,
      idempotencyKey: buildProviderIdempotencyKey({
        dedupeKey: attempt.dedupeKey,
        attemptNumber: nextAttemptNumber,
      }),
    });

    await db.preventiveMaintenanceNotificationDeliveryAttempt.update({
      where: {
        id: attempt.id,
      },
      data: deliveryResult.ok
        ? {
            status: "sent",
            providerMessageId: deliveryResult.providerMessageId,
            providerResponse: deliveryResult.providerResponse,
            errorMessage: null,
            skipReason: null,
            metadata: {
              deliveryMode: "live",
              provider: "resend",
              retried: retrying,
              attemptNumber: nextAttemptNumber,
            },
          }
        : {
            status: "failed",
            providerResponse:
              deliveryResult.providerResponse ?? Prisma.JsonNull,
            errorMessage: deliveryResult.errorMessage,
            skipReason: null,
            metadata: {
              deliveryMode: "live",
              provider: "resend",
              retried: retrying,
              attemptNumber: nextAttemptNumber,
              failureCategory: classifyDeliveryFailure(
                deliveryResult.errorMessage,
              ),
            },
          },
    });
  }

  return {
    providerCallCount,
    retriedAttemptCount,
  };
}

function claimEmailAttemptForDispatch(input: {
  attemptId: string;
  currentStatus: "queued" | "sending" | "sent" | "failed" | "skipped";
  nextAttemptNumber: number;
  recipientAddress: string;
}) {
  return db.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
    where: {
      id: input.attemptId,
      status: input.currentStatus,
      dryRun: false,
      channel: "email",
    },
    data: {
      status: "sending",
      attemptNumber: input.nextAttemptNumber,
      recipientAddress: input.recipientAddress,
      errorMessage: null,
      skipReason: null,
      providerResponse: Prisma.JsonNull,
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

import "server-only";

import {
  Prisma,
  type PreventiveMaintenanceNotificationDeliveryChannel,
  type PreventiveMaintenanceNotificationTrigger,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  getPreventiveMaintenanceEmailDeliveryConfiguration,
  sendPreventiveMaintenanceEmailWithResend,
} from "@/lib/preventive-maintenance-email-delivery";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-api-error";
import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";
import type { AppRole } from "@/lib/roles";

export const PREVENTIVE_MAINTENANCE_DELIVERY_CHANNELS = [
  "email",
  "sms",
] as const satisfies readonly PreventiveMaintenanceNotificationDeliveryChannel[];

export type PreventiveMaintenanceDispatchChannel =
  (typeof PREVENTIVE_MAINTENANCE_DELIVERY_CHANNELS)[number];

type DispatchableNotificationIntent = Prisma.PreventiveMaintenanceNotificationIntentGetPayload<{
  select: typeof dispatchableNotificationIntentSelect;
}>;

export type DispatchPreventiveMaintenanceNotificationsInput = {
  audience: PreventiveMaintenanceNotificationAudience;
  channels: PreventiveMaintenanceDispatchChannel[];
  limit: number;
  dryRun: boolean;
  triggerType?: PreventiveMaintenanceNotificationTrigger | null;
};

export type DispatchPreventiveMaintenanceNotificationsResult = {
  dryRun: boolean;
  channels: PreventiveMaintenanceDispatchChannel[];
  scannedIntentCount: number;
  candidateAttemptCount: number;
  createdAttemptCount: number;
  existingAttemptCount: number;
  missingRecipientCount: number;
  queuedAttemptCount: number;
  sentAttemptCount: number;
  failedAttemptCount: number;
  skippedAttemptCount: number;
  attempts: SerializedPreventiveMaintenanceDeliveryAttempt[];
};

type DeliveryAttemptCreateInput = Prisma.PreventiveMaintenanceNotificationDeliveryAttemptCreateManyInput;

type DeliveryAttemptCandidate = {
  createInput: DeliveryAttemptCreateInput;
  title: string;
  message: string;
};

type SerializedPreventiveMaintenanceDeliveryAttempt = {
  id: string;
  notificationIntentId: string;
  organizationId: string;
  channel: PreventiveMaintenanceDispatchChannel;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  dryRun: boolean;
  recipientAddress: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
};

const dispatchableNotificationIntentSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceNotificationIntentSelect>()({
    id: true,
    organizationId: true,
    triggerType: true,
    recipientRole: true,
    title: true,
    message: true,
    recipientUser: {
      select: {
        email: true,
        phone: true,
      },
    },
  });

const deliveryAttemptSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceNotificationDeliveryAttemptSelect>()({
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
    dedupeKey: true,
    createdAt: true,
    updatedAt: true,
  });

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
    throw new PreventiveMaintenanceNotificationApiError(
      "Forbidden",
      403,
    );
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

  const candidates = buildDeliveryAttemptCandidates({
    channels: input.channels,
    dryRun: input.dryRun,
    intents,
  });
  const createInputs = candidates.map((candidate) => candidate.createInput);

  const createResult =
    createInputs.length > 0
      ? await db.preventiveMaintenanceNotificationDeliveryAttempt.createMany({
          data: createInputs,
          skipDuplicates: true,
        })
      : { count: 0 };

  const attempts =
    createInputs.length > 0
      ? await db.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
          where: {
            dedupeKey: {
              in: createInputs.map((attempt) => attempt.dedupeKey),
            },
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

  if (!input.dryRun && attempts.length > 0) {
    await dispatchQueuedEmailAttempts({
      attempts,
      candidates,
    });
  }

  const finalAttempts =
    createInputs.length > 0
      ? await db.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
          where: {
            dedupeKey: {
              in: createInputs.map((attempt) => attempt.dedupeKey),
            },
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

  return {
    dryRun: input.dryRun,
    channels: input.channels,
    scannedIntentCount: intents.length,
    candidateAttemptCount: createInputs.length,
    createdAttemptCount: createResult.count,
    existingAttemptCount: Math.max(0, createInputs.length - createResult.count),
    missingRecipientCount: finalAttempts.filter((attempt) =>
      attempt.skipReason?.startsWith("missing_recipient_"),
    ).length,
    queuedAttemptCount: statusCounts.queued,
    sentAttemptCount: statusCounts.sent,
    failedAttemptCount: statusCounts.failed,
    skippedAttemptCount: statusCounts.skipped,
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

function validateDispatchMode(input: DispatchPreventiveMaintenanceNotificationsInput) {
  if (input.dryRun) {
    return;
  }

  const unsupportedChannels = input.channels.filter(
    (channel) => channel !== "email",
  );
  if (unsupportedChannels.length > 0) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Phase 4D1 supports live delivery for email only.",
      400,
    );
  }

  const emailConfig = getPreventiveMaintenanceEmailDeliveryConfiguration();
  if (!emailConfig.enabled) {
    throw new PreventiveMaintenanceNotificationApiError(
      `Email delivery is not enabled: ${emailConfig.skipReason}.`,
      400,
    );
  }
}

function buildDeliveryAttemptCandidates(input: {
  intents: DispatchableNotificationIntent[];
  channels: PreventiveMaintenanceDispatchChannel[];
  dryRun: boolean;
}): DeliveryAttemptCandidate[] {
  return input.intents.flatMap((intent) =>
    input.channels.map((channel) => {
      const recipientAddress = resolveRecipientAddress(intent, channel);
      const skipReason = resolveInitialSkipReason({
        channel,
        dryRun: input.dryRun,
        recipientAddress,
      });

      return {
        createInput: {
          notificationIntentId: intent.id,
          organizationId: intent.organizationId,
          channel,
          status: skipReason ? "skipped" : "queued",
          dryRun: input.dryRun,
          recipientAddress,
          skipReason,
          dedupeKey: buildDeliveryAttemptDedupeKey({
            notificationIntentId: intent.id,
            channel,
            dryRun: input.dryRun,
          }),
          metadata: {
            dryRun: input.dryRun,
            triggerType: intent.triggerType,
            recipientRole: intent.recipientRole,
            title: intent.title,
          },
        },
        title: intent.title,
        message: intent.message,
      };
    }),
  );
}

function resolveInitialSkipReason(input: {
  channel: PreventiveMaintenanceDispatchChannel;
  dryRun: boolean;
  recipientAddress: string | null;
}) {
  if (!input.recipientAddress) {
    return `missing_recipient_${input.channel}`;
  }

  if (input.dryRun) {
    return "dry_run";
  }

  if (input.channel !== "email") {
    return "delivery_channel_not_supported";
  }

  return null;
}

function resolveRecipientAddress(
  intent: DispatchableNotificationIntent,
  channel: PreventiveMaintenanceDispatchChannel,
) {
  switch (channel) {
    case "email":
      return intent.recipientUser?.email ?? null;
    case "sms":
      return intent.recipientUser?.phone ?? null;
    default:
      return null;
  }
}

function buildDeliveryAttemptDedupeKey(input: {
  notificationIntentId: string;
  channel: PreventiveMaintenanceDispatchChannel;
  dryRun: boolean;
}) {
  const mode = input.dryRun ? "dry-run" : "send:v1";
  return `pm-delivery:${input.notificationIntentId}:${input.channel}:${mode}`;
}

async function dispatchQueuedEmailAttempts(input: {
  attempts: Array<
    Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
      select: typeof deliveryAttemptSelect;
    }>
  >;
  candidates: DeliveryAttemptCandidate[];
}) {
  const candidatesByDedupeKey = new Map(
    input.candidates.map((candidate) => [
      candidate.createInput.dedupeKey,
      candidate,
    ]),
  );

  for (const attempt of input.attempts) {
    if (
      attempt.dryRun ||
      attempt.channel !== "email" ||
      attempt.status !== "queued" ||
      !attempt.recipientAddress
    ) {
      continue;
    }

    const candidate = candidatesByDedupeKey.get(attempt.dedupeKey);
    if (!candidate) {
      continue;
    }

    const claim = await db.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
      where: {
        id: attempt.id,
        status: "queued",
      },
      data: {
        status: "sending",
        errorMessage: null,
        skipReason: null,
      },
    });

    if (claim.count !== 1) {
      continue;
    }

    const deliveryResult = await sendPreventiveMaintenanceEmailWithResend({
      to: attempt.recipientAddress,
      subject: candidate.title,
      text: candidate.message,
      idempotencyKey: attempt.dedupeKey,
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
          }
        : {
            status: "failed",
            providerResponse:
              deliveryResult.providerResponse ?? Prisma.JsonNull,
            errorMessage: deliveryResult.errorMessage,
            skipReason: null,
          },
    });
  }
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

function serializeDeliveryAttempt(
  attempt: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptGetPayload<{
    select: typeof deliveryAttemptSelect;
  }>,
): SerializedPreventiveMaintenanceDeliveryAttempt {
  return {
    id: attempt.id,
    notificationIntentId: attempt.notificationIntentId,
    organizationId: attempt.organizationId,
    channel: attempt.channel,
    status: attempt.status,
    dryRun: attempt.dryRun,
    recipientAddress: attempt.recipientAddress,
    providerMessageId: attempt.providerMessageId,
    errorMessage: attempt.errorMessage,
    skipReason: attempt.skipReason,
    dedupeKey: attempt.dedupeKey,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

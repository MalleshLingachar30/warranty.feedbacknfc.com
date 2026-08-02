import "server-only";

import {
  Prisma,
  type PreventiveMaintenanceNotificationDeliveryChannel,
  type PreventiveMaintenanceNotificationTrigger,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  PreventiveMaintenanceNotificationApiError,
  type PreventiveMaintenanceNotificationAudience,
} from "@/lib/preventive-maintenance-notifications";
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
  dryRun: true;
  triggerType?: PreventiveMaintenanceNotificationTrigger | null;
};

export type DispatchPreventiveMaintenanceNotificationsResult = {
  dryRun: true;
  channels: PreventiveMaintenanceDispatchChannel[];
  scannedIntentCount: number;
  candidateAttemptCount: number;
  createdAttemptCount: number;
  existingAttemptCount: number;
  missingRecipientCount: number;
  attempts: SerializedPreventiveMaintenanceDeliveryAttempt[];
};

type DeliveryAttemptCreateInput = Prisma.PreventiveMaintenanceNotificationDeliveryAttemptCreateManyInput;

type SerializedPreventiveMaintenanceDeliveryAttempt = {
  id: string;
  notificationIntentId: string;
  organizationId: string;
  channel: PreventiveMaintenanceDispatchChannel;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  dryRun: boolean;
  recipientAddress: string | null;
  skipReason: string | null;
  dedupeKey: string;
  createdAt: string;
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
    skipReason: true,
    dedupeKey: true,
    createdAt: true,
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

export async function dispatchPreventiveMaintenanceNotificationsDryRun(
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

  const createInputs = buildDeliveryAttemptCreateInputs({
    channels: input.channels,
    intents,
  });

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

  return {
    dryRun: true,
    channels: input.channels,
    scannedIntentCount: intents.length,
    candidateAttemptCount: createInputs.length,
    createdAttemptCount: createResult.count,
    existingAttemptCount: Math.max(0, createInputs.length - createResult.count),
    missingRecipientCount: attempts.filter((attempt) =>
      attempt.skipReason?.startsWith("missing_recipient_"),
    ).length,
    attempts: attempts.map(serializeDeliveryAttempt),
  };
}

function buildDeliveryAttemptCreateInputs(input: {
  intents: DispatchableNotificationIntent[];
  channels: PreventiveMaintenanceDispatchChannel[];
}): DeliveryAttemptCreateInput[] {
  return input.intents.flatMap((intent) =>
    input.channels.map((channel) => {
      const recipientAddress = resolveRecipientAddress(intent, channel);
      const skipReason = recipientAddress
        ? "dry_run"
        : `missing_recipient_${channel}`;

      return {
        notificationIntentId: intent.id,
        organizationId: intent.organizationId,
        channel,
        status: "skipped",
        dryRun: true,
        recipientAddress,
        skipReason,
        dedupeKey: buildDeliveryAttemptDedupeKey({
          notificationIntentId: intent.id,
          channel,
        }),
        metadata: {
          dryRun: true,
          triggerType: intent.triggerType,
          recipientRole: intent.recipientRole,
          title: intent.title,
        },
      };
    }),
  );
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
}) {
  return `pm-delivery:${input.notificationIntentId}:${input.channel}:dry-run`;
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
    skipReason: attempt.skipReason,
    dedupeKey: attempt.dedupeKey,
    createdAt: attempt.createdAt.toISOString(),
  };
}

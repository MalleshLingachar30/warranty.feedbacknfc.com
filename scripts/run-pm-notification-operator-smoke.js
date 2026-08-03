#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const OPERATOR_EMAIL =
  process.env.PM_NOTIFICATION_OPERATOR_EMAIL || "ml@feedbacknfc.com";
const SMOKE_TRIGGER =
  process.env.PM_NOTIFICATION_OPERATOR_TRIGGER || "scheduled";
const SMOKE_TITLE = "PM operator delivery smoke";
const DEFAULT_CHANNELS = ["email", "sms"];
const SCHEDULED_FILTER_TRIGGER = "scheduled";
const CONTROL_FILTER_TRIGGER = "started";
const prisma = new PrismaClient();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseDatabaseTarget() {
  const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  assert(rawUrl, "DATABASE_URL or DIRECT_URL is required.");

  const url = new URL(rawUrl);
  const schema = url.searchParams.get("schema") || "public";
  const host = url.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  const isProductionLike = !isLocalhost && schema === "public";

  if (
    isProductionLike &&
    process.env.PM_NOTIFICATION_OPERATOR_SMOKE_ALLOW_PRODUCTION !== "1"
  ) {
    throw new Error(
      "Refusing to run against a non-local public schema. Set PM_NOTIFICATION_OPERATOR_SMOKE_ALLOW_PRODUCTION=1 for an intentional production smoke.",
    );
  }

  return {
    host,
    schema,
    isProductionLike,
  };
}

function parseCleanupMode() {
  const cleanupArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--cleanup="));
  const requestedMode =
    cleanupArg?.slice("--cleanup=".length) ||
    process.env.PM_NOTIFICATION_OPERATOR_SMOKE_CLEANUP ||
    "none";

  if (["none", "archive", "delete"].includes(requestedMode)) {
    return requestedMode;
  }

  throw new Error(
    "Invalid cleanup mode. Use --cleanup=archive for non-destructive archive or --cleanup=delete --confirm-delete for deletion.",
  );
}

function shouldConfirmDelete() {
  return (
    process.argv.includes("--confirm-delete") ||
    process.env.PM_NOTIFICATION_OPERATOR_SMOKE_CONFIRM_DELETE === "1"
  );
}

function buildOperatorVisibilityWhere(operator) {
  if (
    operator.role === "manufacturer_admin" ||
    operator.role === "internal_label_admin"
  ) {
    assert(
      operator.organizationId,
      "Manufacturer operator must have organizationId.",
    );

    return {
      channel: "in_app",
      OR: [
        {
          recipientUserId: operator.id,
        },
        {
          recipientRole: "manufacturer",
          recipientOrganizationId: operator.organizationId,
        },
      ],
    };
  }

  if (
    operator.role === "field_super_admin" ||
    operator.role === "field_service_admin" ||
    operator.role === "service_center_admin" ||
    operator.role === "field_dispatcher"
  ) {
    assert(
      operator.organizationId,
      "Field-service operator must have organizationId.",
    );

    return {
      channel: "in_app",
      OR: [
        {
          recipientUserId: operator.id,
        },
        {
          recipientRole: "service_center",
          recipientOrganizationId: operator.organizationId,
        },
      ],
    };
  }

  throw new Error(
    `Operator role ${operator.role} is not supported for delivery operator smoke.`,
  );
}

function resolveRecipientAddress(operator, channel) {
  if (channel === "email") {
    return operator.email || null;
  }

  if (channel === "sms") {
    return operator.phone || null;
  }

  return null;
}

function initialAttemptStatus() {
  return "skipped";
}

function initialSkipReason(channel, recipientAddress) {
  if (!recipientAddress) {
    return `missing_recipient_${channel}`;
  }

  return "dry_run";
}

function buildDeliveryAttemptInput({ notification, operator, channel }) {
  const recipientAddress = resolveRecipientAddress(operator, channel);

  return {
    notificationIntentId: notification.id,
    organizationId: notification.organizationId,
    channel,
    status: initialAttemptStatus(),
    dryRun: true,
    recipientAddress,
    skipReason: initialSkipReason(channel, recipientAddress),
    attemptNumber: 1,
    dedupeKey: `pm-delivery:${notification.id}:${channel}:dry-run`,
    metadata: {
      dryRun: true,
      smoke: "operator_delivery",
      triggerType: notification.triggerType,
      recipientRole: notification.recipientRole,
      title: notification.title,
    },
  };
}

async function createDryRunAttempts(createInputs) {
  const result =
    createInputs.length > 0
      ? await prisma.preventiveMaintenanceNotificationDeliveryAttempt.createMany(
          {
            data: createInputs,
            skipDuplicates: true,
          },
        )
      : { count: 0 };
  const preparedAt = createInputs.length > 0 ? new Date() : null;

  if (preparedAt) {
    await prisma.preventiveMaintenanceNotificationDeliveryAttempt.updateMany({
      where: {
        dryRun: true,
        dedupeKey: {
          in: createInputs.map((input) => input.dedupeKey),
        },
      },
      data: {
        updatedAt: preparedAt,
      },
    });
  }

  const attempts =
    createInputs.length > 0
      ? await prisma.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
          where: {
            dedupeKey: {
              in: createInputs.map((input) => input.dedupeKey),
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
          select: {
            id: true,
            notificationIntentId: true,
            channel: true,
            status: true,
            dryRun: true,
            recipientAddress: true,
            skipReason: true,
            dedupeKey: true,
            updatedAt: true,
          },
        })
      : [];

  return {
    preparedAt: preparedAt ? preparedAt.toISOString() : null,
    createdAttemptCount: result.count,
    existingAttemptCount: Math.max(0, createInputs.length - result.count),
    attempts,
  };
}

async function upsertSmokeNotification({
  event,
  operator,
  dedupeKey,
  title,
  triggerType,
}) {
  return prisma.preventiveMaintenanceNotificationIntent.upsert({
    where: {
      dedupeKey,
    },
    create: {
      eventId: event.id,
      organizationId: event.organizationId,
      triggerType,
      recipientRole:
        operator.role === "manufacturer_admin" ||
        operator.role === "internal_label_admin"
          ? "manufacturer"
          : "service_center",
      channel: "in_app",
      status: "pending",
      recipientUserId: operator.id,
      recipientOrganizationId: operator.organizationId,
      title,
      message: `Dry-run delivery smoke for ${event.eventNumber}.`,
      dedupeKey,
      metadata: {
        smoke: "operator_delivery",
      },
    },
    update: {
      eventId: event.id,
      organizationId: event.organizationId,
      triggerType,
      status: "pending",
      recipientUserId: operator.id,
      recipientOrganizationId: operator.organizationId,
      title,
      message: `Dry-run delivery smoke for ${event.eventNumber}.`,
      metadata: {
        smoke: "operator_delivery",
        refreshedAt: new Date().toISOString(),
      },
    },
    select: {
      id: true,
      eventId: true,
      organizationId: true,
      triggerType: true,
      recipientRole: true,
      title: true,
      status: true,
    },
  });
}

async function applySmokeCleanup({
  cleanupMode,
  confirmDelete,
  notifications,
}) {
  if (cleanupMode === "none") {
    return {
      mode: cleanupMode,
      archivedCount: 0,
      deletedCount: 0,
    };
  }

  const notificationIds = notifications.map((notification) => notification.id);

  if (cleanupMode === "archive") {
    const result =
      await prisma.preventiveMaintenanceNotificationIntent.updateMany({
        where: {
          id: {
            in: notificationIds,
          },
        },
        data: {
          status: "dismissed",
        },
      });

    return {
      mode: cleanupMode,
      archivedCount: result.count,
      deletedCount: 0,
    };
  }

  if (!confirmDelete) {
    throw new Error(
      "Deleting smoke notifications requires --cleanup=delete --confirm-delete.",
    );
  }

  const result =
    await prisma.preventiveMaintenanceNotificationIntent.deleteMany({
      where: {
        id: {
          in: notificationIds,
        },
      },
    });

  return {
    mode: cleanupMode,
    archivedCount: 0,
    deletedCount: result.count,
  };
}

async function main() {
  const target = parseDatabaseTarget();
  const cleanupMode = parseCleanupMode();
  const operator = await prisma.user.findFirst({
    where: {
      email: OPERATOR_EMAIL,
      isActive: true,
    },
    select: {
      id: true,
      clerkId: true,
      email: true,
      phone: true,
      role: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  assert(operator, `No active operator found for ${OPERATOR_EMAIL}.`);
  const visibilityWhere = buildOperatorVisibilityWhere(operator);

  const event = await prisma.preventiveMaintenanceEvent.findFirst({
    where: {
      organizationId: operator.organizationId || undefined,
    },
    orderBy: [
      {
        scheduledFor: "desc",
      },
      {
        dueDate: "desc",
      },
    ],
    select: {
      id: true,
      eventNumber: true,
      organizationId: true,
    },
  });

  assert(
    event,
    `No PM event found for operator organization ${operator.organization?.name || operator.organizationId}.`,
  );

  const notification = await upsertSmokeNotification({
    event,
    operator,
    dedupeKey: `pm-operator-delivery-smoke:${operator.id}`,
    title: SMOKE_TITLE,
    triggerType: SMOKE_TRIGGER,
  });
  const scheduledFilterNotification = await upsertSmokeNotification({
    event,
    operator,
    dedupeKey: `pm-operator-delivery-smoke:${operator.id}:scheduled-filter`,
    title: `${SMOKE_TITLE} scheduled filter`,
    triggerType: SCHEDULED_FILTER_TRIGGER,
  });
  const controlFilterNotification = await upsertSmokeNotification({
    event,
    operator,
    dedupeKey: `pm-operator-delivery-smoke:${operator.id}:filter-control`,
    title: `${SMOKE_TITLE} filter control`,
    triggerType: CONTROL_FILTER_TRIGGER,
  });
  const smokeNotifications = [
    notification,
    scheduledFilterNotification,
    controlFilterNotification,
  ];

  await prisma.preventiveMaintenanceNotificationDeliveryAttempt.deleteMany({
    where: {
      notificationIntentId: {
        in: smokeNotifications.map((smokeNotification) => smokeNotification.id),
      },
    },
  });

  const visibleBeforeDispatch =
    await prisma.preventiveMaintenanceNotificationIntent.count({
      where: {
        id: notification.id,
        status: "pending",
        ...visibilityWhere,
      },
    });
  assert(
    visibleBeforeDispatch === 1,
    "Smoke notification is not visible to the operator audience.",
  );

  const createInputs = DEFAULT_CHANNELS.map((channel) =>
    buildDeliveryAttemptInput({ notification, operator, channel }),
  );
  const firstDispatch = await createDryRunAttempts(createInputs);
  const secondDispatch = await createDryRunAttempts(createInputs);
  const scheduledFilterNotifications =
    await prisma.preventiveMaintenanceNotificationIntent.findMany({
      where: {
        ...visibilityWhere,
        id: {
          in: [scheduledFilterNotification.id, controlFilterNotification.id],
        },
        status: "pending",
        triggerType: SCHEDULED_FILTER_TRIGGER,
      },
      select: {
        id: true,
        organizationId: true,
        triggerType: true,
        recipientRole: true,
        title: true,
        status: true,
      },
    });
  const scheduledFilterInputs = scheduledFilterNotifications.flatMap(
    (filteredNotification) =>
      DEFAULT_CHANNELS.map((channel) =>
        buildDeliveryAttemptInput({
          notification: filteredNotification,
          operator,
          channel,
        }),
      ),
  );
  const scheduledFilterDispatch = await createDryRunAttempts(
    scheduledFilterInputs,
  );
  const controlAttemptCount =
    await prisma.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: {
        notificationIntentId: controlFilterNotification.id,
      },
    });

  assert(
    firstDispatch.createdAttemptCount === createInputs.length,
    `Expected first dry run to create ${createInputs.length} attempts, created ${firstDispatch.createdAttemptCount}.`,
  );
  assert(
    secondDispatch.createdAttemptCount === 0,
    `Expected second dry run to create 0 duplicate attempts, created ${secondDispatch.createdAttemptCount}.`,
  );
  assert(
    secondDispatch.existingAttemptCount === createInputs.length,
    `Expected second dry run to report ${createInputs.length} existing attempts, got ${secondDispatch.existingAttemptCount}.`,
  );
  assert(
    scheduledFilterNotifications.length === 1 &&
      scheduledFilterNotifications[0].id === scheduledFilterNotification.id,
    "Scheduled trigger filter did not isolate the scheduled smoke notification.",
  );
  assert(
    scheduledFilterDispatch.createdAttemptCount === DEFAULT_CHANNELS.length,
    `Expected scheduled trigger dry run to create ${DEFAULT_CHANNELS.length} attempts, created ${scheduledFilterDispatch.createdAttemptCount}.`,
  );
  assert(
    controlAttemptCount === 0,
    `Scheduled trigger dry run created ${controlAttemptCount} attempts for the non-scheduled control notification.`,
  );

  const visibleWithAttempts =
    await prisma.preventiveMaintenanceNotificationIntent.findFirst({
      where: {
        id: notification.id,
        ...visibilityWhere,
      },
      select: {
        id: true,
        status: true,
        deliveryAttempts: {
          select: {
            id: true,
            channel: true,
            status: true,
            dryRun: true,
            skipReason: true,
          },
          orderBy: {
            channel: "asc",
          },
        },
      },
    });

  assert(visibleWithAttempts, "Visible smoke notification was not found.");
  assert(
    visibleWithAttempts.deliveryAttempts.length === createInputs.length,
    `Expected ${createInputs.length} visible delivery attempts, found ${visibleWithAttempts.deliveryAttempts.length}.`,
  );
  assert(
    visibleWithAttempts.deliveryAttempts.every((attempt) => attempt.dryRun),
    "Every smoke delivery attempt must remain dry-run only.",
  );

  const cleanup = await applySmokeCleanup({
    cleanupMode,
    confirmDelete: shouldConfirmDelete(),
    notifications: smokeNotifications,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        target,
        operator: {
          id: operator.id,
          role: operator.role,
          organization: operator.organization,
        },
        event,
        notification: {
          id: notification.id,
          status: notification.status,
          triggerType: notification.triggerType,
        },
        scheduledFilter: {
          notificationId: scheduledFilterNotification.id,
          controlNotificationId: controlFilterNotification.id,
          createdAttemptCount: scheduledFilterDispatch.createdAttemptCount,
          controlAttemptCount,
        },
        firstDispatch: {
          preparedAt: firstDispatch.preparedAt,
          createdAttemptCount: firstDispatch.createdAttemptCount,
          existingAttemptCount: firstDispatch.existingAttemptCount,
        },
        secondDispatch: {
          preparedAt: secondDispatch.preparedAt,
          createdAttemptCount: secondDispatch.createdAttemptCount,
          existingAttemptCount: secondDispatch.existingAttemptCount,
        },
        attempts: visibleWithAttempts.deliveryAttempts,
        cleanup,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `pm-notification-operator-smoke failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

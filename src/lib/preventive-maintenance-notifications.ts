import "server-only";

import {
  Prisma,
  type PreventiveMaintenanceNotificationTrigger,
  type PreventiveMaintenanceNotificationStatus,
} from "@prisma/client";

import { resolveAppRoleForSession } from "@/lib/app-user";
import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";
import { serializePreventiveMaintenanceDeliveryAttemptForView } from "@/lib/preventive-maintenance-delivery-attempts";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-api-error";
import {
  getWorkspaceSurface,
  isFieldAdminRole,
  isFieldTechnicianRole,
  type AppRole,
} from "@/lib/roles";

export { PreventiveMaintenanceNotificationApiError };

export const preventiveMaintenanceNotificationSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceNotificationIntentSelect>()({
    id: true,
    eventId: true,
    organizationId: true,
    triggerType: true,
    recipientRole: true,
    channel: true,
    status: true,
    title: true,
    message: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    deliveryAttempts: {
      orderBy: {
        updatedAt: "desc",
      },
      take: 6,
      select: {
        id: true,
        channel: true,
        status: true,
        dryRun: true,
        recipientAddress: true,
        providerMessageId: true,
        providerEventStatus: true,
        providerEventAt: true,
        providerReconciledAt: true,
        errorMessage: true,
        skipReason: true,
        attemptNumber: true,
        nextRetryAt: true,
        deadLetteredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    event: {
      select: {
        id: true,
        eventNumber: true,
        eventType: true,
        status: true,
        dueDate: true,
        scheduledFor: true,
        startedAt: true,
        completedAt: true,
        cancelledAt: true,
        asset: {
          select: {
            id: true,
            publicCode: true,
            serialNumber: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
          },
        },
        assignedServiceCenter: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
        assignedTechnician: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
  });

export type PreventiveMaintenanceNotificationRow =
  Prisma.PreventiveMaintenanceNotificationIntentGetPayload<{
    select: typeof preventiveMaintenanceNotificationSelect;
  }>;

export type PreventiveMaintenanceNotificationAudience = {
  clerkUserId: string;
  dbUserId: string;
  role: AppRole;
  organizationId: string | null;
  technicianProfileId: string | null;
  serviceCenterIds: string[];
  where: Prisma.PreventiveMaintenanceNotificationIntentWhereInput;
};

export type SerializedPreventiveMaintenanceLastDryRunSummary = {
  preparedAt: string;
  attemptCount: number;
  statusCounts: {
    queued: number;
    sending: number;
    sent: number;
    failed: number;
    dead_letter: number;
    skipped: number;
  };
  missingRecipientCount: number;
  preferenceSuppressedCount: number;
  dryRunSkipCount: number;
};

export const PREVENTIVE_MAINTENANCE_NOTIFICATION_STATUSES = [
  "pending",
  "delivered",
  "dismissed",
  "cancelled",
] as const satisfies readonly PreventiveMaintenanceNotificationStatus[];

export const PREVENTIVE_MAINTENANCE_NOTIFICATION_TRIGGERS = [
  "scheduled",
  "reassigned",
  "started",
  "completed",
  "cancelled",
] as const satisfies readonly PreventiveMaintenanceNotificationTrigger[];

export function parsePreventiveMaintenanceNotificationStatus(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return (
    PREVENTIVE_MAINTENANCE_NOTIFICATION_STATUSES.find(
      (status) => status === value,
    ) ?? null
  );
}

export function parsePreventiveMaintenanceNotificationTrigger(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return (
    PREVENTIVE_MAINTENANCE_NOTIFICATION_TRIGGERS.find(
      (trigger) => trigger === value,
    ) ?? null
  );
}

export function parsePreventiveMaintenanceNotificationLimit(value: unknown) {
  if (typeof value !== "string") {
    return 20;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 20;
  }

  return Math.min(parsed, 50);
}

export async function getPreventiveMaintenanceNotificationLastDryRunSummary(
  notificationWhere: Prisma.PreventiveMaintenanceNotificationIntentWhereInput,
): Promise<SerializedPreventiveMaintenanceLastDryRunSummary | null> {
  const attemptWhere: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptWhereInput =
    {
      dryRun: true,
      notificationIntent: {
        is: notificationWhere,
      },
    };

  const [
    latestAttempt,
    statusGroups,
    missingRecipientCount,
    preferenceSuppressedCount,
    dryRunSkipCount,
    attemptCount,
  ] = await Promise.all([
    db.preventiveMaintenanceNotificationDeliveryAttempt.findFirst({
      where: attemptWhere,
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        updatedAt: true,
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.groupBy({
      by: ["status"],
      where: attemptWhere,
      _count: {
        _all: true,
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: {
        ...attemptWhere,
        OR: [
          { skipReason: { contains: "_missing_" } },
          { skipReason: { endsWith: "_unavailable" } },
        ],
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: {
        ...attemptWhere,
        OR: [
          { skipReason: { endsWith: "_email_disabled" } },
          { skipReason: { endsWith: "_sms_disabled" } },
        ],
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: {
        ...attemptWhere,
        skipReason: "dry_run",
      },
    }),
    db.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: attemptWhere,
    }),
  ]);

  if (!latestAttempt) {
    return null;
  }

  const statusCounts = {
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    dead_letter: 0,
    skipped: 0,
  };

  for (const group of statusGroups) {
    statusCounts[group.status] = group._count._all;
  }

  return {
    preparedAt: latestAttempt.updatedAt.toISOString(),
    attemptCount,
    statusCounts,
    missingRecipientCount,
    preferenceSuppressedCount,
    dryRunSkipCount,
  };
}

export async function resolvePreventiveMaintenanceNotificationAudience(): Promise<PreventiveMaintenanceNotificationAudience> {
  const auth = await getOptionalAuth();

  if (!auth.userId) {
    throw new PreventiveMaintenanceNotificationApiError("Unauthorized", 401);
  }

  const { role, dbUser } = await resolveAppRoleForSession({
    clerkUserId: auth.userId,
    sessionClaims: auth.sessionClaims,
  });

  const serviceCenterOrganizationId =
    isFieldAdminRole(role) && dbUser.organizationId
      ? dbUser.organizationId
      : null;
  const serviceCenterIds = serviceCenterOrganizationId
    ? await withDatabaseRetry(() =>
        db.serviceCenter
          .findMany({
            where: {
              organizationId: serviceCenterOrganizationId,
            },
            select: {
              id: true,
            },
          })
          .then((rows) => rows.map((row) => row.id)),
      )
    : [];

  return {
    clerkUserId: auth.userId,
    dbUserId: dbUser.id,
    role,
    organizationId: dbUser.organizationId,
    technicianProfileId: dbUser.technicianProfileId,
    serviceCenterIds,
    where: buildPreventiveMaintenanceNotificationVisibilityWhere({
      dbUserId: dbUser.id,
      role,
      organizationId: dbUser.organizationId,
      technicianProfileId: dbUser.technicianProfileId,
      serviceCenterIds,
    }),
  };
}

export function buildPreventiveMaintenanceNotificationVisibilityWhere(input: {
  dbUserId: string;
  role: AppRole;
  organizationId: string | null;
  technicianProfileId: string | null;
  serviceCenterIds: string[];
}): Prisma.PreventiveMaintenanceNotificationIntentWhereInput {
  const or: Prisma.PreventiveMaintenanceNotificationIntentWhereInput[] = [
    {
      recipientUserId: input.dbUserId,
    },
  ];

  const surface = getWorkspaceSurface(input.role);

  if (surface === "manufacturer" && input.organizationId) {
    or.push({
      recipientRole: "manufacturer",
      recipientOrganizationId: input.organizationId,
    });
  }

  if (isFieldAdminRole(input.role) && input.organizationId) {
    or.push({
      recipientRole: "service_center",
      recipientOrganizationId: input.organizationId,
    });

    if (input.serviceCenterIds.length > 0) {
      or.push({
        recipientRole: "service_center",
        recipientServiceCenterId: {
          in: input.serviceCenterIds,
        },
      });
    }
  }

  if (isFieldTechnicianRole(input.role) && input.technicianProfileId) {
    or.push({
      recipientRole: "technician",
      recipientTechnicianId: input.technicianProfileId,
    });
  }

  return {
    channel: "in_app",
    OR: or,
  };
}

export function serializePreventiveMaintenanceNotification(
  notification: PreventiveMaintenanceNotificationRow,
) {
  return {
    id: notification.id,
    eventId: notification.eventId,
    organizationId: notification.organizationId,
    triggerType: notification.triggerType,
    recipientRole: notification.recipientRole,
    channel: notification.channel,
    status: notification.status,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata,
    deliveryAttempts: notification.deliveryAttempts.map((attempt) =>
      serializePreventiveMaintenanceDeliveryAttemptForView(attempt),
    ),
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
    event: {
      id: notification.event.id,
      eventNumber: notification.event.eventNumber,
      eventType: notification.event.eventType,
      status: notification.event.status,
      dueDate: notification.event.dueDate.toISOString(),
      scheduledFor: notification.event.scheduledFor?.toISOString() ?? null,
      startedAt: notification.event.startedAt?.toISOString() ?? null,
      completedAt: notification.event.completedAt?.toISOString() ?? null,
      cancelledAt: notification.event.cancelledAt?.toISOString() ?? null,
      asset: {
        id: notification.event.asset.id,
        publicCode: notification.event.asset.publicCode,
        serialNumber: notification.event.asset.serialNumber,
        productModel: {
          name: notification.event.asset.productModel.name,
          modelNumber: notification.event.asset.productModel.modelNumber ?? "",
        },
      },
      assignedServiceCenter: notification.event.assignedServiceCenter
        ? {
            id: notification.event.assignedServiceCenter.id,
            name: notification.event.assignedServiceCenter.name,
            city: notification.event.assignedServiceCenter.city,
          }
        : null,
      assignedTechnician: notification.event.assignedTechnician
        ? {
            id: notification.event.assignedTechnician.id,
            name: notification.event.assignedTechnician.name,
          }
        : null,
    },
  };
}

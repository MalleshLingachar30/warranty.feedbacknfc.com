import "server-only";

import {
  Prisma,
  type PreventiveMaintenanceNotificationAuditOperation,
  type PreventiveMaintenanceNotificationAuditOutcome,
  type PreventiveMaintenanceNotificationDeliveryChannel,
} from "@prisma/client";

import { db } from "@/lib/db";
import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";

type StartAuditInput = {
  audience: PreventiveMaintenanceNotificationAudience;
  operation: PreventiveMaintenanceNotificationAuditOperation;
  channel?: PreventiveMaintenanceNotificationDeliveryChannel | null;
  recipientAddressMasked?: string | null;
  metadata?: Prisma.InputJsonValue;
};

type FinishAuditInput = {
  auditId: string;
  outcome: Exclude<PreventiveMaintenanceNotificationAuditOutcome, "attempted">;
  notificationIntentCount?: number;
  deliveryAttemptCount?: number;
  providerCallCount?: number;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function startPreventiveMaintenanceNotificationAudit(
  input: StartAuditInput,
) {
  return db.preventiveMaintenanceNotificationAuditLog.create({
    data: {
      organizationId: input.audience.organizationId,
      actorUserId: input.audience.dbUserId,
      actorRole: input.audience.role,
      operation: input.operation,
      outcome: "attempted",
      channel: input.channel ?? null,
      recipientAddressMasked: input.recipientAddressMasked ?? null,
      metadata: input.metadata ?? {},
    },
    select: {
      id: true,
      createdAt: true,
    },
  });
}

export async function finishPreventiveMaintenanceNotificationAudit(
  input: FinishAuditInput,
) {
  await db.preventiveMaintenanceNotificationAuditLog.update({
    where: {
      id: input.auditId,
    },
    data: {
      outcome: input.outcome,
      notificationIntentCount: input.notificationIntentCount,
      deliveryAttemptCount: input.deliveryAttemptCount,
      providerCallCount: input.providerCallCount,
      providerMessageId: input.providerMessageId,
      errorMessage: truncateAuditError(input.errorMessage ?? null),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}

export async function finishPreventiveMaintenanceNotificationAuditSafely(
  input: FinishAuditInput,
) {
  try {
    await finishPreventiveMaintenanceNotificationAudit(input);
  } catch (error) {
    console.error("Unable to finalize PM notification audit log", {
      auditId: input.auditId,
      error,
    });
  }
}

export function preventiveMaintenanceAuditErrorMessage(error: unknown) {
  return truncateAuditError(
    error instanceof Error ? error.message : "Unknown live delivery error.",
  );
}

function truncateAuditError(value: string | null) {
  if (!value) {
    return null;
  }

  return value.length > 1_000 ? `${value.slice(0, 997)}...` : value;
}

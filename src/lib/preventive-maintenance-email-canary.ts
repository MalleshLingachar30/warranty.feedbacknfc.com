import "server-only";

import { canDispatchPreventiveMaintenanceNotifications } from "@/lib/preventive-maintenance-notification-dispatch";
import {
  getPreventiveMaintenanceEmailCanaryConfiguration,
  getPreventiveMaintenanceEmailDeliveryReadiness,
  sendPreventiveMaintenanceEmailWithResend,
} from "@/lib/preventive-maintenance-email-delivery";
import {
  finishPreventiveMaintenanceNotificationAuditSafely,
  startPreventiveMaintenanceNotificationAudit,
} from "@/lib/preventive-maintenance-notification-audit";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-api-error";
import { getPreventiveMaintenanceNotificationPreferences } from "@/lib/preventive-maintenance-notification-preferences";
import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";

type SendCanaryInput = {
  audience: PreventiveMaintenanceNotificationAudience;
  confirmLiveCanary: boolean;
};

export type SendPreventiveMaintenanceEmailCanaryResult = {
  ok: true;
  auditId: string;
  recipientAddressMasked: string;
  providerMessageId: string | null;
  sentAt: string;
};

export async function sendPreventiveMaintenanceEmailCanary(
  input: SendCanaryInput,
): Promise<SendPreventiveMaintenanceEmailCanaryResult> {
  if (!canDispatchPreventiveMaintenanceNotifications(input.audience.role)) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  const readiness = getPreventiveMaintenanceEmailDeliveryReadiness();
  const preferences = input.audience.organizationId
    ? await getPreventiveMaintenanceNotificationPreferences(
        input.audience.organizationId,
        input.audience.role,
      )
    : null;
  const audit = await startPreventiveMaintenanceNotificationAudit({
    audience: input.audience,
    operation: "live_canary",
    channel: "email",
    recipientAddressMasked: readiness.canary.recipientAddressMasked,
    metadata: {
      provider: readiness.provider,
      liveEmailStatus: readiness.liveEmail.status,
      canaryStatus: readiness.canary.status,
      organizationEmailEnabled:
        preferences === null ? null : preferences.emailEnabledRoleCount > 0,
      confirmationProvided: input.confirmLiveCanary,
    },
  });

  if (!input.confirmLiveCanary) {
    const errorMessage = "Live canary requires confirmLiveCanary: true.";
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome: "rejected",
      errorMessage,
    });
    throw new PreventiveMaintenanceNotificationApiError(errorMessage, 400);
  }

  if (preferences && preferences.emailEnabledRoleCount === 0) {
    const errorMessage =
      "Live email canary is suppressed because email is disabled for every PM notification audience in this organization.";
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome: "rejected",
      errorMessage,
      metadata: {
        suppressionReason: "organization_email_disabled",
      },
    });
    throw new PreventiveMaintenanceNotificationApiError(errorMessage, 409);
  }

  const configuration = getPreventiveMaintenanceEmailCanaryConfiguration();
  if (!configuration.enabled) {
    const errorMessage = `Live email canary is not ready: ${configuration.skipReason}.`;
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome: "rejected",
      errorMessage,
    });
    throw new PreventiveMaintenanceNotificationApiError(errorMessage, 409);
  }

  const requestedAt = new Date();
  const deliveryResult = await sendPreventiveMaintenanceEmailWithResend({
    to: configuration.recipient,
    subject: "PM notification live-delivery canary",
    text: [
      "This is a controlled internal canary for PM notification email delivery.",
      "No customer or technician notification was sent.",
      `Requested at: ${requestedAt.toISOString()}`,
      `Operator role: ${input.audience.role}`,
      `Audit ID: ${audit.id}`,
    ].join("\n"),
    idempotencyKey: `pm-notification-live-canary:${audit.id}`,
  });

  if (!deliveryResult.ok) {
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome: "failed",
      providerCallCount: 1,
      errorMessage: deliveryResult.errorMessage,
    });
    throw new PreventiveMaintenanceNotificationApiError(
      `Live email canary failed: ${deliveryResult.errorMessage}`,
      502,
    );
  }

  await finishPreventiveMaintenanceNotificationAuditSafely({
    auditId: audit.id,
    outcome: "succeeded",
    providerCallCount: 1,
    providerMessageId: deliveryResult.providerMessageId,
  });

  return {
    ok: true,
    auditId: audit.id,
    recipientAddressMasked: configuration.recipientAddressMasked,
    providerMessageId: deliveryResult.providerMessageId,
    sentAt: new Date().toISOString(),
  };
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFinish: vi.fn(),
  auditStart: vi.fn(),
  deliveryAttemptCreateMany: vi.fn(),
  deliveryAttemptFindMany: vi.fn(),
  deliveryAttemptUpdateMany: vi.fn(),
  emailConfiguration: vi.fn(),
  emailReadiness: vi.fn(),
  intentFindMany: vi.fn(),
  hygieneFindMany: vi.fn(),
  organizationFindMany: vi.fn(),
  preferencesForOrganizations: vi.fn(),
  sendEmail: vi.fn(),
  serviceCenterFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    preventiveMaintenanceNotificationIntent: {
      findMany: mocks.intentFindMany,
    },
    preventiveMaintenanceNotificationDeliveryAttempt: {
      createMany: mocks.deliveryAttemptCreateMany,
      findMany: mocks.deliveryAttemptFindMany,
      updateMany: mocks.deliveryAttemptUpdateMany,
    },
    preventiveMaintenanceNotificationRecipientHygiene: {
      findMany: mocks.hygieneFindMany,
    },
    organization: {
      findMany: mocks.organizationFindMany,
    },
    serviceCenter: {
      findMany: mocks.serviceCenterFindMany,
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

vi.mock("@/lib/preventive-maintenance-email-delivery", () => ({
  getPreventiveMaintenanceEmailDeliveryConfiguration: mocks.emailConfiguration,
  getPreventiveMaintenanceEmailDeliveryReadiness: mocks.emailReadiness,
  sendPreventiveMaintenanceEmailWithResend: mocks.sendEmail,
}));

vi.mock("@/lib/preventive-maintenance-notification-audit", () => ({
  finishPreventiveMaintenanceNotificationAuditSafely: mocks.auditFinish,
  preventiveMaintenanceAuditErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Unknown error",
  startPreventiveMaintenanceNotificationAudit: mocks.auditStart,
  startPreventiveMaintenanceNotificationSystemAudit: vi.fn(),
}));

vi.mock("@/lib/preventive-maintenance-notification-preferences", () => ({
  getPreventiveMaintenanceNotificationPreferencesForOrganizations:
    mocks.preferencesForOrganizations,
}));

import {
  dispatchPreventiveMaintenanceNotificationsForScheduledRun,
  sendPreventiveMaintenanceManualEmailPilot,
} from "@/lib/preventive-maintenance-notification-dispatch";
import { PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION } from "@/lib/preventive-maintenance-manual-email-pilot-policy";
import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";
import { hashPreventiveMaintenanceRecipientAddress } from "@/lib/preventive-maintenance-recipient-hygiene";

const notificationId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000010";
const rawRecipient = "pilot.recipient@example.com";
const now = new Date("2026-08-10T12:00:00.000Z");

const audience: PreventiveMaintenanceNotificationAudience = {
  clerkUserId: "clerk-operator",
  dbUserId: "00000000-0000-4000-8000-000000000020",
  role: "manufacturer_admin",
  organizationId,
  technicianProfileId: null,
  serviceCenterIds: [],
  where: { organizationId },
};

const request = {
  notificationIds: [notificationId],
  confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
};

const dispatchableIntent = {
  id: notificationId,
  organizationId,
  triggerType: "scheduled",
  recipientRole: "customer",
  recipientUserId: "00000000-0000-4000-8000-000000000030",
  recipientOrganizationId: null,
  recipientServiceCenterId: null,
  title: "Preventive maintenance due",
  message: "Book preventive maintenance.",
  recipientUser: {
    email: rawRecipient,
    phone: null,
    organizationId,
    isActive: true,
  },
};

function deliveryAttempt(status: "queued" | "sent" | "skipped") {
  return {
    id: "00000000-0000-4000-8000-000000000040",
    notificationIntentId: notificationId,
    organizationId,
    channel: "email",
    status,
    dryRun: false,
    recipientAddress: rawRecipient,
    providerMessageId: status === "sent" ? "provider-message-1" : null,
    providerEventStatus: status === "sent" ? "accepted" : null,
    providerEventAt: status === "sent" ? now : null,
    providerReconciledAt: status === "sent" ? now : null,
    errorMessage: null,
    skipReason:
      status === "skipped" ? "recipient_hygiene_blocked_suppressed" : null,
    attemptNumber: 1,
    dedupeKey: `pm-delivery:${notificationId}:email:send:v1`,
    claimToken: null,
    claimedAt: null,
    claimExpiresAt: null,
    nextRetryAt: null,
    deadLetteredAt: null,
    scheduledRunId: null,
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditStart.mockResolvedValue({ id: "audit-1", createdAt: now });
  mocks.auditFinish.mockResolvedValue(undefined);
  mocks.emailReadiness.mockReturnValue({
    provider: "resend",
    liveEmail: {
      status: "ready",
      enabled: true,
      apiKeyConfigured: true,
      fromEmailConfigured: true,
      missingConfiguration: [],
    },
    canary: {
      status: "disabled",
      enabled: false,
      recipientConfigured: false,
      recipientAddressMasked: null,
      missingConfiguration: [],
    },
    sms: { status: "unsupported" },
  });
  mocks.emailConfiguration.mockReturnValue({
    enabled: true,
    apiKey: "re_test",
    from: "Warranty <notifications@example.com>",
  });
  mocks.preferencesForOrganizations.mockResolvedValue(new Map());
  mocks.hygieneFindMany.mockResolvedValue([]);
  mocks.organizationFindMany.mockResolvedValue([
    { id: organizationId, contactEmail: null, contactPhone: null },
  ]);
  mocks.serviceCenterFindMany.mockResolvedValue([]);
  mocks.deliveryAttemptCreateMany.mockResolvedValue({ count: 1 });
  mocks.deliveryAttemptUpdateMany.mockResolvedValue({ count: 1 });
  mocks.sendEmail.mockResolvedValue({
    ok: true,
    providerMessageId: "provider-message-1",
    providerResponse: { id: "provider-message-1" },
  });
});

describe("sendPreventiveMaintenanceManualEmailPilot", () => {
  it("sends one confirmed reviewed email through the existing dispatcher and returns only masked recipient data", async () => {
    mocks.intentFindMany
      .mockResolvedValueOnce([
        {
          id: notificationId,
          deliveryAttempts: [{ updatedAt: now }],
        },
      ])
      .mockResolvedValueOnce([dispatchableIntent]);
    mocks.deliveryAttemptFindMany
      .mockResolvedValueOnce([deliveryAttempt("queued")])
      .mockResolvedValueOnce([deliveryAttempt("sent")]);

    const result = await sendPreventiveMaintenanceManualEmailPilot({
      audience,
      request,
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: rawRecipient,
        subject: dispatchableIntent.title,
      }),
    );
    expect(result.sentAttemptCount).toBe(1);
    expect(result.providerCallCount).toBe(1);
    expect(result.attempts[0]?.recipientAddressMasked).toBe("p***@e***.com");
    expect(JSON.stringify(result)).not.toContain(rawRecipient);
    expect(JSON.stringify(result)).not.toContain("providerResponse");
    expect(mocks.auditStart).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "manual_live_email_pilot",
        channel: "email",
      }),
    );
    expect(mocks.auditFinish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auditId: "audit-1",
        outcome: "succeeded",
        providerCallCount: 1,
      }),
    );
  });

  it("rejects before recipient lookup or provider calls when the hard live email gate is disabled", async () => {
    mocks.emailReadiness.mockReturnValue({
      provider: "resend",
      liveEmail: {
        status: "disabled",
        enabled: false,
        apiKeyConfigured: true,
        fromEmailConfigured: true,
        missingConfiguration: [],
      },
      canary: {
        status: "disabled",
        enabled: false,
        recipientConfigured: false,
        recipientAddressMasked: null,
        missingConfiguration: [],
      },
      sms: { status: "unsupported" },
    });

    await expect(
      sendPreventiveMaintenanceManualEmailPilot({ audience, request }),
    ).rejects.toThrow("PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED");

    expect(mocks.intentFindMany).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.auditFinish).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "rejected" }),
    );
  });

  it("suppresses a reviewed live email when reconciliation marked its recipient as a hygiene risk", async () => {
    mocks.intentFindMany
      .mockResolvedValueOnce([
        {
          id: notificationId,
          deliveryAttempts: [{ updatedAt: now }],
        },
      ])
      .mockResolvedValueOnce([dispatchableIntent]);
    mocks.hygieneFindMany.mockResolvedValue([
      {
        organizationId,
        channel: "email",
        recipientAddressHash: hashPreventiveMaintenanceRecipientAddress(
          rawRecipient,
          "email",
        ),
        status: "suppressed",
      },
    ]);
    mocks.deliveryAttemptFindMany
      .mockResolvedValueOnce([deliveryAttempt("skipped")])
      .mockResolvedValueOnce([deliveryAttempt("skipped")]);

    const result = await sendPreventiveMaintenanceManualEmailPilot({
      audience,
      request,
    });

    expect(result.sentAttemptCount).toBe(0);
    expect(result.skippedAttemptCount).toBe(1);
    expect(result.providerCallCount).toBe(0);
    expect(result.attempts[0]?.skipReason).toBe(
      "recipient_hygiene_blocked_suppressed",
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe("dispatchPreventiveMaintenanceNotificationsForScheduledRun", () => {
  it("scopes scheduled dispatches to the configured organization allowlist", async () => {
    mocks.intentFindMany.mockResolvedValueOnce([]);

    await dispatchPreventiveMaintenanceNotificationsForScheduledRun({
      scheduledRunId: "00000000-0000-4000-8000-000000000050",
      channels: ["email"],
      limit: 5,
      dryRun: true,
      retryFailed: true,
      triggerType: null,
      scheduledOrganizationIds: [organizationId],
    });

    expect(mocks.intentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: "in_app",
          status: "pending",
          organizationId: {
            in: [organizationId],
          },
          deliveryAttempts: {
            none: {
              channel: "email",
              dryRun: true,
            },
          },
        }),
        take: 5,
      }),
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

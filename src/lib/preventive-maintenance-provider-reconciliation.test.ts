import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFinish: vi.fn(),
  auditStart: vi.fn(),
  attemptFindMany: vi.fn(),
  attemptUpdate: vi.fn(),
  hygieneUpsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    preventiveMaintenanceNotificationDeliveryAttempt: {
      findMany: mocks.attemptFindMany,
      update: mocks.attemptUpdate,
    },
    preventiveMaintenanceNotificationRecipientHygiene: {
      upsert: mocks.hygieneUpsert,
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

vi.mock("@/lib/preventive-maintenance-notification-audit", () => ({
  finishPreventiveMaintenanceNotificationAuditSafely: mocks.auditFinish,
  preventiveMaintenanceAuditErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Unknown error",
  startPreventiveMaintenanceNotificationAudit: mocks.auditStart,
}));

import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";
import {
  buildPreventiveMaintenanceProviderReconciliationScopeWhere,
  reconcilePreventiveMaintenanceProviderEvents,
} from "@/lib/preventive-maintenance-provider-reconciliation";
import { parsePreventiveMaintenanceProviderReconciliationRequest } from "@/lib/preventive-maintenance-provider-reconciliation-policy";

const organizationId = "95ba109f-b777-4eb7-9e38-26b4bb5c4a38";
const operatorUserId = "00000000-0000-4000-8000-000000000020";
const audience: PreventiveMaintenanceNotificationAudience = {
  clerkUserId: "clerk-operator",
  dbUserId: operatorUserId,
  role: "manufacturer_admin",
  organizationId,
  technicianProfileId: null,
  serviceCenterIds: [],
  where: {
    channel: "in_app",
    OR: [
      { recipientUserId: operatorUserId },
      {
        recipientRole: "manufacturer",
        recipientOrganizationId: organizationId,
      },
    ],
  },
};

const sanitizedEvidence = JSON.parse(
  await readFile(
    resolve(
      process.cwd(),
      "scripts/fixtures/pm-phase5c-resend-provider-status-sanitized.json",
    ),
    "utf8",
  ),
) as unknown;
const evidenceEvents =
  parsePreventiveMaintenanceProviderReconciliationRequest(sanitizedEvidence);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditStart.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000099",
    createdAt: new Date("2026-08-11T05:00:00.000Z"),
  });
  mocks.auditFinish.mockResolvedValue(undefined);
  mocks.attemptUpdate.mockResolvedValue({});
  mocks.hygieneUpsert.mockResolvedValue({});
});

describe("reconcilePreventiveMaintenanceProviderEvents", () => {
  it("matches all 15 Phase 5C provider IDs through owning-organization scope even when inbox visibility matches only two recipients", async () => {
    mocks.attemptFindMany.mockResolvedValue(
      evidenceEvents.map((event, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        organizationId,
        recipientAddress: `recipient-${index}@example.com`,
        providerMessageId: event.providerMessageId,
        providerEventStatus: "accepted",
        providerEventAt: new Date(event.occurredAt.getTime() - 100),
      })),
    );

    const result = await reconcilePreventiveMaintenanceProviderEvents({
      audience,
      events: evidenceEvents,
    });

    expect(evidenceEvents).toHaveLength(15);
    expect(result.submittedEventCount).toBe(15);
    expect(result.updatedAttemptCount).toBe(15);
    expect(result.staleEventCount).toBe(0);
    expect(result.notFoundCount).toBe(0);
    expect(result.hygieneSignalCount).toBe(5);
    expect(result.providerEventCounts).toMatchObject({
      delivered: 7,
      bounced: 1,
      sent: 1,
      suppressed: 4,
      delivery_delayed: 2,
    });
    expect(mocks.hygieneUpsert).toHaveBeenCalledTimes(5);
    expect(mocks.attemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { organizationId },
            { notificationIntent: { is: audience.where } },
          ],
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("recipient-0@example.com");
    expect(mocks.auditFinish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outcome: "succeeded",
        deliveryAttemptCount: 15,
      }),
    );
  });

  it("reports an identical already-reconciled event as stale instead of not found", async () => {
    const [event] = evidenceEvents;
    mocks.attemptFindMany.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000001",
        organizationId,
        recipientAddress: "recipient@example.com",
        providerMessageId: event.providerMessageId,
        providerEventStatus: event.status,
        providerEventAt: event.occurredAt,
      },
    ]);

    const result = await reconcilePreventiveMaintenanceProviderEvents({
      audience,
      events: [event],
    });

    expect(result.updatedAttemptCount).toBe(0);
    expect(result.staleEventCount).toBe(1);
    expect(result.notFoundCount).toBe(0);
    expect(mocks.attemptUpdate).not.toHaveBeenCalled();
  });
});

describe("buildPreventiveMaintenanceProviderReconciliationScopeWhere", () => {
  it("keeps platform-owner reconciliation global", () => {
    expect(
      buildPreventiveMaintenanceProviderReconciliationScopeWhere({
        ...audience,
        role: "platform_owner",
        organizationId: null,
      }),
    ).toEqual({});
  });
});

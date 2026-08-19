import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchScheduledRun: vi.fn(),
  emailReadiness: vi.fn(),
  leaseDeleteMany: vi.fn(),
  queryRaw: vi.fn(),
  scheduledRunCreate: vi.fn(),
  scheduledRunUpdate: vi.fn(),
  systemAuditFinish: vi.fn(),
  systemAuditStart: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();

  return {
    ...actual,
    default: {
      ...actual,
      randomUUID: () => "claim-token",
    },
    randomUUID: () => "claim-token",
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    preventiveMaintenanceNotificationScheduledRun: {
      create: mocks.scheduledRunCreate,
      update: mocks.scheduledRunUpdate,
    },
    preventiveMaintenanceNotificationSchedulerLease: {
      deleteMany: mocks.leaseDeleteMany,
    },
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/lib/preventive-maintenance-email-delivery", () => ({
  getPreventiveMaintenanceEmailDeliveryReadiness: mocks.emailReadiness,
}));

vi.mock("@/lib/preventive-maintenance-notification-dispatch", () => ({
  dispatchPreventiveMaintenanceNotificationsForScheduledRun:
    mocks.dispatchScheduledRun,
}));

vi.mock("@/lib/preventive-maintenance-notification-audit", () => ({
  finishPreventiveMaintenanceNotificationAuditSafely: mocks.systemAuditFinish,
  preventiveMaintenanceAuditErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Unknown error",
  startPreventiveMaintenanceNotificationSystemAudit: mocks.systemAuditStart,
}));

import { runPreventiveMaintenanceScheduledDispatcher } from "@/lib/preventive-maintenance-scheduled-dispatcher";

const now = new Date("2026-08-19T05:45:30.000Z");
const organizationId = "00000000-0000-4000-8000-000000000001";

function scheduledRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    runKey: "pm-scheduled-dispatch:2026-08-19T05:45:00.000Z",
    status: "running",
    dryRun: false,
    requestedLiveDelivery: true,
    scheduleWindowStartedAt: new Date("2026-08-19T05:45:00.000Z"),
    startedAt: now,
    completedAt: null,
    scannedIntentCount: 0,
    candidateAttemptCount: 0,
    createdAttemptCount: 0,
    existingAttemptCount: 0,
    providerCallCount: 0,
    retriedAttemptCount: 0,
    deferredRetryCount: 0,
    deadLetteredAttemptCount: 0,
    preferenceSuppressedCount: 0,
    suppressionReasonCounts: {},
    errorMessage: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_BATCH_LIMIT;
  delete process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_ORGANIZATION_IDS;
  process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_ENABLED = "true";
  process.env.PM_NOTIFICATION_SCHEDULED_LIVE_DELIVERY_ENABLED = "true";

  mocks.emailReadiness.mockReturnValue({
    liveEmail: {
      status: "ready",
      missingConfiguration: [],
    },
  });
  mocks.scheduledRunCreate.mockResolvedValue(scheduledRunRow());
  mocks.queryRaw.mockResolvedValue([{ claim_token: "claim-token" }]);
  mocks.systemAuditStart.mockResolvedValue({ id: "audit-1" });
  mocks.dispatchScheduledRun.mockResolvedValue({
    scannedIntentCount: 2,
    candidateAttemptCount: 2,
    createdAttemptCount: 2,
    existingAttemptCount: 0,
    failedAttemptCount: 0,
    deadLetteredAttemptCount: 0,
    newlyDeadLetteredAttemptCount: 0,
    providerCallCount: 2,
    retriedAttemptCount: 0,
    deferredRetryCount: 0,
    preferenceSuppressedCount: 0,
    suppressionReasonCounts: {},
    missingRecipientCount: 0,
    reclaimedAttemptCount: 0,
    skippedAttemptCount: 0,
    sentAttemptCount: 2,
  });
  mocks.scheduledRunUpdate.mockImplementation(({ data }) =>
    scheduledRunRow({
      ...data,
      status: data.status,
      completedAt: data.completedAt,
    }),
  );
});

describe("runPreventiveMaintenanceScheduledDispatcher", () => {
  it("passes Phase 5F batch and organization controls into dispatch and run metadata", async () => {
    process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_BATCH_LIMIT = "5";
    process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_ORGANIZATION_IDS =
      organizationId;

    const result = await runPreventiveMaintenanceScheduledDispatcher({ now });

    expect(result.configuration).toEqual(
      expect.objectContaining({
        mode: "live",
        dryRun: false,
        batchLimit: 5,
        batchLimitControl: {
          source: "environment",
          configuredValue: "5",
          clamped: false,
        },
        organizationScope: {
          mode: "allowlist",
          organizationIds: [organizationId],
          organizationCount: 1,
          invalidOrganizationIds: [],
        },
      }),
    );
    expect(mocks.scheduledRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            batchLimit: 5,
            batchLimitControl: expect.objectContaining({
              source: "environment",
            }),
            organizationScope: expect.objectContaining({
              mode: "allowlist",
              organizationIds: [organizationId],
            }),
          }),
        }),
      }),
    );
    expect(mocks.dispatchScheduledRun).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5,
        dryRun: false,
        confirmLiveDelivery: true,
        scheduledOrganizationIds: [organizationId],
      }),
    );
    expect(mocks.scheduledRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            batchLimit: 5,
            organizationScope: expect.objectContaining({
              organizationIds: [organizationId],
            }),
          }),
        }),
      }),
    );
    expect(mocks.systemAuditFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          batchLimit: 5,
          organizationScope: expect.objectContaining({
            organizationIds: [organizationId],
          }),
        }),
      }),
    );
  });
});

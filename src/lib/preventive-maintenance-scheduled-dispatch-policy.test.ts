import { describe, expect, it } from "vitest";

import {
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT,
  resolvePreventiveMaintenanceScheduledDispatchBatchLimit,
  resolvePreventiveMaintenanceScheduledDispatcherMode,
  resolvePreventiveMaintenanceScheduledOrganizationScope,
} from "@/lib/preventive-maintenance-scheduled-dispatch-policy";

describe("resolvePreventiveMaintenanceScheduledDispatchBatchLimit", () => {
  it("uses the default scheduled batch limit when no override is configured", () => {
    expect(resolvePreventiveMaintenanceScheduledDispatchBatchLimit()).toEqual({
      batchLimit: PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_BATCH_LIMIT,
      configuredValue: null,
      source: "default",
      clamped: false,
      blockingReasons: [],
    });
  });

  it("accepts an integer override inside the safe range", () => {
    expect(
      resolvePreventiveMaintenanceScheduledDispatchBatchLimit("5"),
    ).toEqual({
      batchLimit: 5,
      configuredValue: "5",
      source: "environment",
      clamped: false,
      blockingReasons: [],
    });
  });

  it("clamps integer overrides to the 1-50 range", () => {
    expect(
      resolvePreventiveMaintenanceScheduledDispatchBatchLimit("500"),
    ).toEqual(
      expect.objectContaining({
        batchLimit: 50,
        source: "environment",
        clamped: true,
        blockingReasons: [],
      }),
    );
    expect(
      resolvePreventiveMaintenanceScheduledDispatchBatchLimit("0"),
    ).toEqual(
      expect.objectContaining({
        batchLimit: 1,
        source: "environment",
        clamped: true,
        blockingReasons: [],
      }),
    );
  });

  it("marks malformed overrides as live blockers", () => {
    expect(
      resolvePreventiveMaintenanceScheduledDispatchBatchLimit("five"),
    ).toEqual(
      expect.objectContaining({
        batchLimit: 1,
        source: "environment",
        blockingReasons: ["PM_NOTIFICATION_SCHEDULED_DISPATCH_BATCH_LIMIT"],
      }),
    );
  });
});

describe("resolvePreventiveMaintenanceScheduledOrganizationScope", () => {
  const firstOrganizationId = "00000000-0000-4000-8000-000000000001";
  const secondOrganizationId = "00000000-0000-4000-8000-000000000002";

  it("defaults to all organizations when no allowlist is configured", () => {
    expect(resolvePreventiveMaintenanceScheduledOrganizationScope()).toEqual({
      mode: "all",
      organizationIds: [],
      configuredValue: null,
      invalidOrganizationIds: [],
      blockingReasons: [],
    });
  });

  it("deduplicates valid organization IDs into an allowlist", () => {
    expect(
      resolvePreventiveMaintenanceScheduledOrganizationScope(
        `${firstOrganizationId}, ${secondOrganizationId}, ${firstOrganizationId}`,
      ),
    ).toEqual({
      mode: "allowlist",
      organizationIds: [firstOrganizationId, secondOrganizationId],
      configuredValue: `${firstOrganizationId}, ${secondOrganizationId}, ${firstOrganizationId}`,
      invalidOrganizationIds: [],
      blockingReasons: [],
    });
  });

  it("marks invalid allowlist entries as live blockers", () => {
    expect(
      resolvePreventiveMaintenanceScheduledOrganizationScope(
        `${firstOrganizationId}, not-an-id`,
      ),
    ).toEqual({
      mode: "allowlist",
      organizationIds: [firstOrganizationId],
      configuredValue: `${firstOrganizationId}, not-an-id`,
      invalidOrganizationIds: ["not-an-id"],
      blockingReasons: ["PM_NOTIFICATION_SCHEDULED_DISPATCH_ORGANIZATION_IDS"],
    });
  });
});

describe("resolvePreventiveMaintenanceScheduledDispatcherMode", () => {
  it("holds requested live delivery in dry-run when rollout controls are invalid", () => {
    expect(
      resolvePreventiveMaintenanceScheduledDispatcherMode({
        schedulerEnabled: true,
        liveDeliveryRequested: true,
        liveEmailStatus: "ready",
        liveEmailMissingConfiguration: [],
        rolloutControlBlockingReasons: [
          "PM_NOTIFICATION_SCHEDULED_DISPATCH_ORGANIZATION_IDS",
        ],
      }),
    ).toEqual({
      enabled: true,
      mode: "dry_run",
      dryRun: true,
      liveDeliveryRequested: true,
      blockingReasons: ["PM_NOTIFICATION_SCHEDULED_DISPATCH_ORGANIZATION_IDS"],
    });
  });
});

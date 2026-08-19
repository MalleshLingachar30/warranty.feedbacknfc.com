import "server-only";

import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";
import { getPreventiveMaintenanceEmailDeliveryReadiness } from "@/lib/preventive-maintenance-email-delivery";
import { getPreventiveMaintenanceScheduledDispatcherConfiguration } from "@/lib/preventive-maintenance-scheduled-dispatcher";

export const MEDCORE_PM_DEMO_ORG_ID =
  "95ba109f-b777-4eb7-9e38-26b4bb5c4a38";
export const MEDCORE_PM_DEMO_ORG_NAME = "MedCore Critical Care India Pvt Ltd";
export const MEDCORE_PM_DEMO_SEED = "phase5h-medcore-pm-cycle";
export const MEDCORE_PM_DEMO_EXTERNAL_PREFIX = "MEDCORE-PM-DEMO";
export const MEDCORE_PM_DEMO_SERVICE_ORG_SLUG =
  "medcore-pm-demo-service-partner";
export const MEDCORE_PM_DEMO_EVENT_NUMBERS = [
  "MCOREPM-001",
  "MCOREPM-002",
  "MCOREPM-003",
] as const;

type ReadinessStatus = "pass" | "warn" | "fail";

export type PreventiveMaintenanceDemoReadinessCheck = {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
};

export type PreventiveMaintenanceDemoReadiness = {
  generatedAt: string;
  overallStatus: ReadinessStatus;
  organization: {
    expectedId: string;
    expectedName: string;
    currentId: string | null;
    currentName: string | null;
    found: boolean;
    matchesExpectedDemoTenant: boolean;
  };
  demoSeed: {
    key: string;
    resetCommand: string;
    counts: {
      productModels: number;
      assets: number;
      plans: number;
      events: number;
      timelines: number;
      notifications: number;
      deliveryAttempts: number;
      serviceCenters: number;
      technicians: number;
      users: number;
      serviceOrganizations: number;
    };
    storyEvents: Array<{
      eventNumber: string;
      status: string;
      triggerCount: number;
      scheduledFor: string | null;
      updatedAt: string;
    }>;
  };
  scheduler: ReturnType<
    typeof getPreventiveMaintenanceScheduledDispatcherConfiguration
  >;
  deliveryReadiness: ReturnType<
    typeof getPreventiveMaintenanceEmailDeliveryReadiness
  >;
  smokeData: {
    events: number;
    notifications: number;
    plans: number;
    assets: number;
    productModels: number;
    total: number;
  };
  migrations: {
    reachable: boolean;
    appliedCount: number | null;
    latestMigrationName: string | null;
    failedCount: number | null;
    error: string | null;
  };
  checks: PreventiveMaintenanceDemoReadinessCheck[];
};

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

const STORY_STATUS_ORDER = ["scheduled", "in_progress", "completed"] as const;

function demoTaggedWhere() {
  return {
    metadata: {
      path: ["demoSeed"],
      equals: MEDCORE_PM_DEMO_SEED,
    },
  };
}

function statusFromChecks(
  checks: readonly PreventiveMaintenanceDemoReadinessCheck[],
): ReadinessStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }

  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }

  return "pass";
}

function countByStatus(
  storyEvents: PreventiveMaintenanceDemoReadiness["demoSeed"]["storyEvents"],
) {
  return storyEvents.reduce<Record<string, number>>((accumulator, event) => {
    accumulator[event.status] = (accumulator[event.status] ?? 0) + 1;
    return accumulator;
  }, {});
}

function isClerkDevelopmentKeyConfigured() {
  return (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
    process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    false
  );
}

function buildResetCommand(organizationId: string) {
  return [
    "npm run seed:medcore-pm-demo --",
    "--reset",
    "--confirm-medcore-demo-reset",
    "--cleanup-old-smoke",
    "--confirm-cleanup-old-smoke",
    "--allow-production",
    `--organization-id=${organizationId}`,
  ].join(" ");
}

async function getMigrationSummary(): Promise<
  PreventiveMaintenanceDemoReadiness["migrations"]
> {
  try {
    const rows = await db.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      ORDER BY started_at DESC
    `;
    const activeRows = rows.filter((row) => !row.rolled_back_at);
    const failedRows = activeRows.filter((row) => !row.finished_at);

    return {
      reachable: true,
      appliedCount: activeRows.length,
      latestMigrationName: activeRows[0]?.migration_name ?? null,
      failedCount: failedRows.length,
      error: null,
    };
  } catch (error) {
    return {
      reachable: false,
      appliedCount: null,
      latestMigrationName: null,
      failedCount: null,
      error: error instanceof Error ? error.message : "Unknown migration error",
    };
  }
}

export async function getPreventiveMaintenanceDemoReadiness(input?: {
  organizationId?: string | null;
}): Promise<PreventiveMaintenanceDemoReadiness> {
  const currentOrganizationId = input?.organizationId ?? null;
  const targetOrganizationId = currentOrganizationId || MEDCORE_PM_DEMO_ORG_ID;
  const taggedWhere = demoTaggedWhere();
  const deliveryReadiness = getPreventiveMaintenanceEmailDeliveryReadiness();
  const scheduler = getPreventiveMaintenanceScheduledDispatcherConfiguration();

  const [
    organization,
    productModels,
    assets,
    plans,
    events,
    timelines,
    notifications,
    deliveryAttempts,
    serviceCenters,
    technicians,
    users,
    serviceOrganizations,
    storyEvents,
    smokeEvents,
    smokeNotifications,
    smokePlans,
    smokeAssets,
    smokeProductModels,
    migrations,
  ] = await withDatabaseRetry(() =>
    Promise.all([
      db.organization.findUnique({
        where: { id: targetOrganizationId },
        select: { id: true, name: true, type: true },
      }),
      db.productModel.count({
        where: {
          organizationId: targetOrganizationId,
          externalItemCode: {
            startsWith: MEDCORE_PM_DEMO_EXTERNAL_PREFIX,
          },
        },
      }),
      db.assetIdentity.count({
        where: {
          organizationId: targetOrganizationId,
          ...taggedWhere,
        },
      }),
      db.preventiveMaintenancePlan.count({
        where: {
          organizationId: targetOrganizationId,
          ...taggedWhere,
        },
      }),
      db.preventiveMaintenanceEvent.count({
        where: {
          organizationId: targetOrganizationId,
          ...taggedWhere,
        },
      }),
      db.preventiveMaintenanceEventTimeline.count({
        where: taggedWhere,
      }),
      db.preventiveMaintenanceNotificationIntent.count({
        where: {
          organizationId: targetOrganizationId,
          ...taggedWhere,
        },
      }),
      db.preventiveMaintenanceNotificationDeliveryAttempt.count({
        where: {
          organizationId: targetOrganizationId,
          ...taggedWhere,
        },
      }),
      db.serviceCenter.count({
        where: {
          organizationId: targetOrganizationId,
          name: {
            startsWith: "MedCore Demo",
          },
        },
      }),
      db.technician.count({
        where: {
          user: taggedWhere,
        },
      }),
      db.user.count({
        where: {
          organizationId: targetOrganizationId,
          ...taggedWhere,
        },
      }),
      db.organization.count({
        where: {
          slug: MEDCORE_PM_DEMO_SERVICE_ORG_SLUG,
        },
      }),
      db.preventiveMaintenanceEvent.findMany({
        where: {
          organizationId: targetOrganizationId,
          eventNumber: {
            in: [...MEDCORE_PM_DEMO_EVENT_NUMBERS],
          },
        },
        orderBy: {
          eventNumber: "asc",
        },
        select: {
          eventNumber: true,
          status: true,
          scheduledFor: true,
          updatedAt: true,
          notificationIntents: {
            select: {
              id: true,
            },
          },
        },
      }),
      db.preventiveMaintenanceEvent.count({
        where: {
          OR: [
            { eventNumber: { startsWith: "PMSMOKE-" } },
            { eventNumber: { startsWith: "P4A-D_" } },
          ],
        },
      }),
      db.preventiveMaintenanceNotificationIntent.count({
        where: {
          OR: [
            { title: { startsWith: "PM operator delivery smoke" } },
            {
              metadata: {
                path: ["smoke"],
                equals: "operator_delivery",
              },
            },
            {
              event: {
                eventNumber: {
                  startsWith: "PMSMOKE-",
                },
              },
            },
          ],
        },
      }),
      db.preventiveMaintenancePlan.count({
        where: {
          OR: [
            { name: { startsWith: "Production PM Smoke Plan" } },
            { name: { startsWith: "Production Phase 4A Smoke Plan" } },
          ],
        },
      }),
      db.assetIdentity.count({
        where: {
          OR: [
            { publicCode: { startsWith: "PROD-PM-" } },
            { serialNumber: { startsWith: "PM-SMOKE-" } },
            { publicCode: { startsWith: "PM-P4A-" } },
          ],
        },
      }),
      db.productModel.count({
        where: {
          OR: [
            { name: { startsWith: "Production PM Smoke Model" } },
            { modelNumber: { startsWith: "PM-SMOKE-" } },
          ],
        },
      }),
      getMigrationSummary(),
    ]),
  );

  const serializedStoryEvents = storyEvents.map((event) => ({
    eventNumber: event.eventNumber,
    status: event.status,
    triggerCount: event.notificationIntents.length,
    scheduledFor: event.scheduledFor?.toISOString() ?? null,
    updatedAt: event.updatedAt.toISOString(),
  }));
  const storyStatusCounts = countByStatus(serializedStoryEvents);
  const smokeTotal =
    smokeEvents +
    smokeNotifications +
    smokePlans +
    smokeAssets +
    smokeProductModels;
  const matchesExpectedDemoTenant =
    Boolean(organization) &&
    organization?.id === MEDCORE_PM_DEMO_ORG_ID &&
    organization.name === MEDCORE_PM_DEMO_ORG_NAME &&
    organization.type === "manufacturer";
  const schedulerScopedToMedCore =
    scheduler.organizationScope.mode === "allowlist" &&
    scheduler.organizationScope.organizationIds.length === 1 &&
    scheduler.organizationScope.organizationIds[0] === MEDCORE_PM_DEMO_ORG_ID;
  const storyComplete =
    MEDCORE_PM_DEMO_EVENT_NUMBERS.every((eventNumber) =>
      serializedStoryEvents.some((event) => event.eventNumber === eventNumber),
    ) &&
    STORY_STATUS_ORDER.every((status) => storyStatusCounts[status] === 1);
  const notificationsReady = notifications >= 3 && deliveryAttempts >= 3;

  const checks: PreventiveMaintenanceDemoReadinessCheck[] = [
    {
      id: "medcore_tenant",
      label: "MedCore tenant",
      status: matchesExpectedDemoTenant ? "pass" : "fail",
      detail: matchesExpectedDemoTenant
        ? "Signed-in workspace matches the MedCore manufacturer demo tenant."
        : "Current workspace is not the expected MedCore manufacturer demo tenant.",
    },
    {
      id: "demo_story",
      label: "PM story records",
      status: storyComplete ? "pass" : "fail",
      detail: storyComplete
        ? "MCOREPM-001, MCOREPM-002, and MCOREPM-003 cover scheduled, in-progress, and completed states."
        : "Expected MCOREPM story events are missing or not in the expected lifecycle states.",
    },
    {
      id: "notification_evidence",
      label: "Notification evidence",
      status: notificationsReady ? "pass" : "fail",
      detail: notificationsReady
        ? "Demo notifications and dry-run delivery attempts are present for reporting/export."
        : "Demo notifications or dry-run delivery attempts are missing.",
    },
    {
      id: "scheduler_live_guard",
      label: "Scheduled live guard",
      status: scheduler.mode === "live" ? "fail" : "pass",
      detail:
        scheduler.mode === "live"
          ? "Scheduled live delivery is enabled; disable it before a safe client demo."
          : `Scheduled dispatcher is in ${scheduler.mode} mode; no scheduled live sends will run.`,
    },
    {
      id: "scheduler_rollout_scope",
      label: "Scheduler rollout scope",
      status:
        scheduler.batchLimit === 5 &&
        schedulerScopedToMedCore &&
        scheduler.organizationScope.invalidOrganizationIds.length === 0
          ? "pass"
          : "fail",
      detail:
        scheduler.batchLimit === 5 && schedulerScopedToMedCore
          ? "Scheduler cap is 5 and scoped to the MedCore organization allowlist."
          : "Scheduler cap or organization allowlist is not in the expected Phase 5F demo posture.",
    },
    {
      id: "legacy_smoke_data",
      label: "Legacy smoke data",
      status: smokeTotal === 0 ? "pass" : "fail",
      detail:
        smokeTotal === 0
          ? "No legacy PM smoke records are visible in the demo reporting path."
          : `${smokeTotal} legacy PM smoke record groups still need cleanup.`,
    },
    {
      id: "migration_state",
      label: "Migration state",
      status:
        migrations.reachable && migrations.failedCount === 0 ? "pass" : "fail",
      detail:
        migrations.reachable && migrations.failedCount === 0
          ? `Prisma migration table is reachable with ${migrations.appliedCount ?? 0} applied migrations.`
          : migrations.error ?? "Prisma migration table has failed migrations.",
    },
    {
      id: "email_provider",
      label: "Email provider",
      status:
        deliveryReadiness.liveEmail.status === "ready" ? "pass" : "warn",
      detail:
        deliveryReadiness.liveEmail.status === "ready"
          ? "Resend live email configuration is complete."
          : `Live email is ${deliveryReadiness.liveEmail.status}; manual/scheduled live sends should stay closed.`,
    },
    {
      id: "clerk_keys",
      label: "Clerk keys",
      status: isClerkDevelopmentKeyConfigured() ? "warn" : "pass",
      detail: isClerkDevelopmentKeyConfigured()
        ? "Clerk development keys are accepted for this demo by product direction."
        : "Clerk production-key warning is not present from environment configuration.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: statusFromChecks(checks),
    organization: {
      expectedId: MEDCORE_PM_DEMO_ORG_ID,
      expectedName: MEDCORE_PM_DEMO_ORG_NAME,
      currentId: organization?.id ?? currentOrganizationId,
      currentName: organization?.name ?? null,
      found: Boolean(organization),
      matchesExpectedDemoTenant,
    },
    demoSeed: {
      key: MEDCORE_PM_DEMO_SEED,
      resetCommand: buildResetCommand(MEDCORE_PM_DEMO_ORG_ID),
      counts: {
        productModels,
        assets,
        plans,
        events,
        timelines,
        notifications,
        deliveryAttempts,
        serviceCenters,
        technicians,
        users,
        serviceOrganizations,
      },
      storyEvents: serializedStoryEvents,
    },
    scheduler,
    deliveryReadiness,
    smokeData: {
      events: smokeEvents,
      notifications: smokeNotifications,
      plans: smokePlans,
      assets: smokeAssets,
      productModels: smokeProductModels,
      total: smokeTotal,
    },
    migrations,
    checks,
  };
}

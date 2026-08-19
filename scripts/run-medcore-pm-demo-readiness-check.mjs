#!/usr/bin/env node

import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { resolvePreventiveMaintenanceEmailDeliveryReadiness } from "../src/lib/preventive-maintenance-email-readiness.ts";
import {
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS,
  PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_WINDOW_MINUTES,
  resolvePreventiveMaintenanceScheduledDispatchBatchLimit,
  resolvePreventiveMaintenanceScheduledDispatcherMode,
  resolvePreventiveMaintenanceScheduledOrganizationScope,
} from "../src/lib/preventive-maintenance-scheduled-dispatch-policy.ts";

const MEDCORE_PM_DEMO_ORG_ID = "95ba109f-b777-4eb7-9e38-26b4bb5c4a38";
const MEDCORE_PM_DEMO_ORG_NAME = "MedCore Critical Care India Pvt Ltd";
const MEDCORE_PM_DEMO_SEED = "phase5h-medcore-pm-cycle";
const MEDCORE_PM_DEMO_EXTERNAL_PREFIX = "MEDCORE-PM-DEMO";
const MEDCORE_PM_DEMO_SERVICE_ORG_SLUG = "medcore-pm-demo-service-partner";
const MEDCORE_PM_DEMO_EVENT_NUMBERS = [
  "MCOREPM-001",
  "MCOREPM-002",
  "MCOREPM-003",
];
const STORY_STATUS_ORDER = ["scheduled", "in_progress", "completed"];

const prisma = new PrismaClient();

function parseArgs() {
  const args = new Map();
  const flags = new Set();

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...valueParts] = arg.slice(2).split("=");
      args.set(key, valueParts.join("="));
    } else if (arg.startsWith("--")) {
      flags.add(arg.slice(2));
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return {
    organizationId: args.get("organization-id") || MEDCORE_PM_DEMO_ORG_ID,
    json: flags.has("json"),
    help: flags.has("help"),
  };
}

function printHelp() {
  process.stdout.write(`Usage:
  npm run check:medcore-pm-demo-readiness
  npm run check:medcore-pm-demo-readiness -- --json

Options:
  --organization-id=<uuid>  MedCore manufacturer id. Defaults to ${MEDCORE_PM_DEMO_ORG_ID}.
  --json                    Print machine-readable readiness details.

Checks:
  - MedCore manufacturer tenant exists and matches expected demo identity.
  - Phase 5H demo seed records exist for scheduled, in-progress, and completed PM events.
  - Notification and dry-run delivery evidence is present for reporting/export.
  - Scheduled live dispatch is not enabled.
  - Scheduler batch cap is 5 and organization allowlist contains only MedCore.
  - Legacy PM smoke-test rows are absent.
  - Prisma migration table is reachable and has no failed migrations.
`);
}

function maskRecipientAddress(value) {
  const normalized = value.trim().toLowerCase();
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) {
    return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function demoTaggedWhere() {
  return {
    metadata: {
      path: ["demoSeed"],
      equals: MEDCORE_PM_DEMO_SEED,
    },
  };
}

function buildSchedulerConfiguration() {
  const deliveryReadiness = resolvePreventiveMaintenanceEmailDeliveryReadiness(
    process.env,
    maskRecipientAddress,
  );
  const batchLimit = resolvePreventiveMaintenanceScheduledDispatchBatchLimit();
  const organizationScope =
    resolvePreventiveMaintenanceScheduledOrganizationScope();
  const mode = resolvePreventiveMaintenanceScheduledDispatcherMode({
    schedulerEnabled:
      process.env.PM_NOTIFICATION_SCHEDULED_DISPATCH_ENABLED === "true",
    liveDeliveryRequested:
      process.env.PM_NOTIFICATION_SCHEDULED_LIVE_DELIVERY_ENABLED === "true",
    liveEmailStatus: deliveryReadiness.liveEmail.status,
    liveEmailMissingConfiguration:
      deliveryReadiness.liveEmail.missingConfiguration,
    rolloutControlBlockingReasons: [
      ...batchLimit.blockingReasons,
      ...organizationScope.blockingReasons,
    ],
  });

  return {
    ...mode,
    authorizationConfigured: Boolean(
      process.env.PM_NOTIFICATION_SCHEDULER_CRON_SECRET?.trim() ||
        process.env.CRON_SECRET?.trim(),
    ),
    schedule: `Every ${PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_WINDOW_MINUTES} minutes`,
    batchLimit: batchLimit.batchLimit,
    batchLimitControl: {
      source: batchLimit.source,
      configuredValue: batchLimit.configuredValue,
      clamped: batchLimit.clamped,
    },
    organizationScope: {
      mode: organizationScope.mode,
      organizationIds: organizationScope.organizationIds,
      organizationCount: organizationScope.organizationIds.length,
      invalidOrganizationIds: organizationScope.invalidOrganizationIds,
    },
    maxAttempts: PREVENTIVE_MAINTENANCE_SCHEDULED_DISPATCH_MAX_ATTEMPTS,
  };
}

async function getMigrationSummary() {
  try {
    const rows = await prisma.$queryRaw`
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

function countByStatus(storyEvents) {
  return storyEvents.reduce((accumulator, event) => {
    accumulator[event.status] = (accumulator[event.status] ?? 0) + 1;
    return accumulator;
  }, {});
}

function statusFromChecks(checks) {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }

  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }

  return "pass";
}

async function getReadiness(organizationId) {
  const taggedWhere = demoTaggedWhere();
  const scheduler = buildSchedulerConfiguration();
  const deliveryReadiness = resolvePreventiveMaintenanceEmailDeliveryReadiness(
    process.env,
    maskRecipientAddress,
  );

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
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, type: true },
    }),
    prisma.productModel.count({
      where: {
        organizationId,
        externalItemCode: { startsWith: MEDCORE_PM_DEMO_EXTERNAL_PREFIX },
      },
    }),
    prisma.assetIdentity.count({ where: { organizationId, ...taggedWhere } }),
    prisma.preventiveMaintenancePlan.count({
      where: { organizationId, ...taggedWhere },
    }),
    prisma.preventiveMaintenanceEvent.count({
      where: { organizationId, ...taggedWhere },
    }),
    prisma.preventiveMaintenanceEventTimeline.count({ where: taggedWhere }),
    prisma.preventiveMaintenanceNotificationIntent.count({
      where: { organizationId, ...taggedWhere },
    }),
    prisma.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: { organizationId, ...taggedWhere },
    }),
    prisma.serviceCenter.count({
      where: { organizationId, name: { startsWith: "MedCore Demo" } },
    }),
    prisma.technician.count({ where: { user: taggedWhere } }),
    prisma.user.count({ where: { organizationId, ...taggedWhere } }),
    prisma.organization.count({
      where: { slug: MEDCORE_PM_DEMO_SERVICE_ORG_SLUG },
    }),
    prisma.preventiveMaintenanceEvent.findMany({
      where: {
        organizationId,
        eventNumber: { in: MEDCORE_PM_DEMO_EVENT_NUMBERS },
      },
      orderBy: { eventNumber: "asc" },
      select: {
        eventNumber: true,
        status: true,
        scheduledFor: true,
        updatedAt: true,
        notificationIntents: { select: { id: true } },
      },
    }),
    prisma.preventiveMaintenanceEvent.count({
      where: {
        OR: [
          { eventNumber: { startsWith: "PMSMOKE-" } },
          { eventNumber: { startsWith: "P4A-D_" } },
        ],
      },
    }),
    prisma.preventiveMaintenanceNotificationIntent.count({
      where: {
        OR: [
          { title: { startsWith: "PM operator delivery smoke" } },
          { metadata: { path: ["smoke"], equals: "operator_delivery" } },
          { event: { eventNumber: { startsWith: "PMSMOKE-" } } },
        ],
      },
    }),
    prisma.preventiveMaintenancePlan.count({
      where: {
        OR: [
          { name: { startsWith: "Production PM Smoke Plan" } },
          { name: { startsWith: "Production Phase 4A Smoke Plan" } },
        ],
      },
    }),
    prisma.assetIdentity.count({
      where: {
        OR: [
          { publicCode: { startsWith: "PROD-PM-" } },
          { serialNumber: { startsWith: "PM-SMOKE-" } },
          { publicCode: { startsWith: "PM-P4A-" } },
        ],
      },
    }),
    prisma.productModel.count({
      where: {
        OR: [
          { name: { startsWith: "Production PM Smoke Model" } },
          { modelNumber: { startsWith: "PM-SMOKE-" } },
        ],
      },
    }),
    getMigrationSummary(),
  ]);

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
    ) && STORY_STATUS_ORDER.every((status) => storyStatusCounts[status] === 1);
  const notificationsReady = notifications >= 3 && deliveryAttempts >= 3;
  const checks = [
    {
      id: "medcore_tenant",
      status: matchesExpectedDemoTenant ? "pass" : "fail",
      detail: organization?.name ?? "MedCore organization missing",
    },
    {
      id: "demo_story",
      status: storyComplete ? "pass" : "fail",
      detail: `${serializedStoryEvents.length} story events`,
    },
    {
      id: "notification_evidence",
      status: notificationsReady ? "pass" : "fail",
      detail: `${notifications} notifications, ${deliveryAttempts} delivery attempts`,
    },
    {
      id: "scheduled_live_guard",
      status: scheduler.mode === "live" ? "fail" : "pass",
      detail: `scheduler mode ${scheduler.mode}`,
    },
    {
      id: "scheduler_scope",
      status:
        scheduler.batchLimit === 5 &&
        schedulerScopedToMedCore &&
        scheduler.organizationScope.invalidOrganizationIds.length === 0
          ? "pass"
          : "fail",
      detail: `batch ${scheduler.batchLimit}, allowed orgs ${scheduler.organizationScope.organizationCount}`,
    },
    {
      id: "legacy_smoke_data",
      status: smokeTotal === 0 ? "pass" : "fail",
      detail: `${smokeTotal} legacy smoke record groups`,
    },
    {
      id: "migration_state",
      status:
        migrations.reachable && migrations.failedCount === 0 ? "pass" : "fail",
      detail: migrations.reachable
        ? `${migrations.appliedCount} applied migrations`
        : migrations.error,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: statusFromChecks(checks),
    organization,
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

function printSummary(readiness) {
  process.stdout.write(`MedCore PM demo readiness: ${readiness.overallStatus}
generatedAt=${readiness.generatedAt}
organization=${readiness.organization?.name ?? "missing"}
events=${readiness.counts.events}
notifications=${readiness.counts.notifications}
deliveryAttempts=${readiness.counts.deliveryAttempts}
schedulerMode=${readiness.scheduler.mode}
schedulerBatchLimit=${readiness.scheduler.batchLimit}
schedulerAllowedOrganizations=${readiness.scheduler.organizationScope.organizationIds.join(",") || "all"}
legacySmokeTotal=${readiness.smokeData.total}
migrationsApplied=${readiness.migrations.appliedCount ?? "unknown"}

Checks:
`);

  for (const check of readiness.checks) {
    process.stdout.write(`- ${check.status.toUpperCase()} ${check.id}: ${check.detail}\n`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  const readiness = await getReadiness(args.organizationId);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
  } else {
    printSummary(readiness);
  }

  if (readiness.overallStatus === "fail") {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

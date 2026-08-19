#!/usr/bin/env node

import assert from "node:assert/strict";

import { PrismaClient } from "@prisma/client";

import {
  createPreventiveMaintenanceNotificationIntentsForEvent,
  createPreventiveMaintenanceTimelineEntry,
} from "../src/lib/preventive-maintenance.ts";

const MEDCORE_ORG_ID = "95ba109f-b777-4eb7-9e38-26b4bb5c4a38";
const MEDCORE_ORG_NAME = "MedCore Critical Care India Pvt Ltd";
const DEMO_SEED = "phase5h-medcore-pm-cycle";
const DEMO_EXTERNAL_PREFIX = "MEDCORE-PM-DEMO";
const DEMO_SERVICE_ORG_SLUG = "medcore-pm-demo-service-partner";
const DEMO_OPERATOR_EMAIL =
  process.env.MEDCORE_PM_DEMO_OPERATOR_EMAIL || "ml@feedbacknfc.com";
const DEMO_RECIPIENT_EMAIL =
  process.env.MEDCORE_PM_DEMO_RECIPIENT_EMAIL || DEMO_OPERATOR_EMAIL;
const DEMO_RECIPIENT_PHONE =
  process.env.MEDCORE_PM_DEMO_RECIPIENT_PHONE || "+919900000101";

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
    organizationId: args.get("organization-id") || MEDCORE_ORG_ID,
    reset: flags.has("reset"),
    seed: !flags.has("reset-only"),
    dryRun: flags.has("dry-run"),
    allowProduction:
      flags.has("allow-production") ||
      process.env.MEDCORE_PM_DEMO_ALLOW_PRODUCTION === "1",
    confirmReset:
      flags.has("confirm-medcore-demo-reset") ||
      process.env.MEDCORE_PM_DEMO_CONFIRM_RESET === "1",
    cleanupOldSmoke: flags.has("cleanup-old-smoke"),
    confirmCleanupOldSmoke:
      flags.has("confirm-cleanup-old-smoke") ||
      process.env.MEDCORE_PM_DEMO_CONFIRM_CLEANUP_OLD_SMOKE === "1",
    help: flags.has("help"),
  };
}

function printHelp() {
  process.stdout.write(`Usage:
  npm run seed:medcore-pm-demo -- --reset --confirm-medcore-demo-reset

Options:
  --organization-id=<uuid>            Must match the MedCore manufacturer id.
  --reset                             Delete only Phase 5H demo-tagged rows before seeding.
  --reset-only                        Delete only Phase 5H demo-tagged rows; do not seed.
  --dry-run                           Print planned actions without writing.
  --allow-production                  Required for production-like public databases.
  --confirm-medcore-demo-reset        Required with --reset or --reset-only.
  --cleanup-old-smoke                 Also remove legacy PM smoke notifications/plans/events.
  --confirm-cleanup-old-smoke         Required with --cleanup-old-smoke.

Safety:
  The normal reset only targets rows tagged with metadata.demoSeed="${DEMO_SEED}".
  Old smoke cleanup is separate and only targets visibly named legacy PM smoke data.
`);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseDatabaseTarget() {
  const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  assertCondition(rawUrl, "DATABASE_URL or DIRECT_URL is required.");

  const url = new URL(rawUrl);
  const schema = url.searchParams.get("schema") || "public";
  const host = url.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  const isProductionLike = !isLocalhost && schema === "public";

  return {
    host,
    schema,
    isProductionLike,
  };
}

function startOfUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function setUtcTime(date, hours, minutes) {
  const result = new Date(date);
  result.setUTCHours(hours, minutes, 0, 0);
  return result;
}

function demoMetadata(extra = {}) {
  return {
    demoSeed: DEMO_SEED,
    demoScenario: "MedCore production PM cycle",
    seededAt: new Date().toISOString(),
    ...extra,
  };
}

function taggedWhere() {
  return {
    metadata: {
      path: ["demoSeed"],
      equals: DEMO_SEED,
    },
  };
}

async function verifyMedCoreOrganization(organizationId) {
  assert.equal(
    organizationId,
    MEDCORE_ORG_ID,
    `Refusing to seed non-MedCore organization ${organizationId}.`,
  );

  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      id: true,
      name: true,
      type: true,
      slug: true,
    },
  });

  assertCondition(organization, `Organization ${organizationId} not found.`);
  assert.equal(organization.type, "manufacturer");
  assert.equal(organization.name, MEDCORE_ORG_NAME);

  return organization;
}

async function countExistingDemoRows() {
  const [
    deliveryAttempts,
    notifications,
    timelines,
    events,
    plans,
    assets,
    productModels,
    technicians,
    serviceCenters,
    users,
    serviceOrganizations,
  ] = await Promise.all([
    prisma.preventiveMaintenanceNotificationDeliveryAttempt.count({
      where: taggedWhere(),
    }),
    prisma.preventiveMaintenanceNotificationIntent.count({
      where: taggedWhere(),
    }),
    prisma.preventiveMaintenanceEventTimeline.count({
      where: taggedWhere(),
    }),
    prisma.preventiveMaintenanceEvent.count({
      where: taggedWhere(),
    }),
    prisma.preventiveMaintenancePlan.count({
      where: taggedWhere(),
    }),
    prisma.assetIdentity.count({
      where: taggedWhere(),
    }),
    prisma.productModel.count({
      where: {
        externalItemCode: {
          startsWith: DEMO_EXTERNAL_PREFIX,
        },
      },
    }),
    prisma.technician.count({
      where: {
        user: taggedWhere(),
      },
    }),
    prisma.serviceCenter.count({
      where: {
        name: {
          startsWith: "MedCore Demo",
        },
      },
    }),
    prisma.user.count({
      where: taggedWhere(),
    }),
    prisma.organization.count({
      where: {
        slug: DEMO_SERVICE_ORG_SLUG,
      },
    }),
  ]);

  return {
    deliveryAttempts,
    notifications,
    timelines,
    events,
    plans,
    assets,
    productModels,
    technicians,
    serviceCenters,
    users,
    serviceOrganizations,
  };
}

async function resetDemoRows() {
  const result = {};

  result.deliveryAttempts =
    await prisma.preventiveMaintenanceNotificationDeliveryAttempt.deleteMany({
      where: taggedWhere(),
    });
  result.notifications =
    await prisma.preventiveMaintenanceNotificationIntent.deleteMany({
      where: taggedWhere(),
    });
  result.timelines =
    await prisma.preventiveMaintenanceEventTimeline.deleteMany({
      where: taggedWhere(),
    });
  result.events = await prisma.preventiveMaintenanceEvent.deleteMany({
    where: taggedWhere(),
  });
  result.plans = await prisma.preventiveMaintenancePlan.deleteMany({
    where: taggedWhere(),
  });
  result.assets = await prisma.assetIdentity.deleteMany({
    where: taggedWhere(),
  });
  result.productModels = await prisma.productModel.deleteMany({
    where: {
      externalItemCode: {
        startsWith: DEMO_EXTERNAL_PREFIX,
      },
    },
  });
  result.technicians = await prisma.technician.deleteMany({
    where: {
      user: taggedWhere(),
    },
  });
  result.serviceCenters = await prisma.serviceCenter.deleteMany({
    where: {
      name: {
        startsWith: "MedCore Demo",
      },
    },
  });
  result.users = await prisma.user.deleteMany({
    where: taggedWhere(),
  });
  result.serviceOrganizations = await prisma.organization.deleteMany({
    where: {
      slug: DEMO_SERVICE_ORG_SLUG,
    },
  });

  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [key, value.count]),
  );
}

async function cleanupOldOperatorSmoke() {
  const legacyEvents = await prisma.preventiveMaintenanceEvent.findMany({
    where: {
      OR: [
        {
          eventNumber: {
            startsWith: "PMSMOKE-",
          },
        },
        {
          eventNumber: {
            startsWith: "P4A-D_",
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });
  const legacyEventIds = legacyEvents.map((event) => event.id);
  const smokeNotifications =
    await prisma.preventiveMaintenanceNotificationIntent.findMany({
      where: {
        OR: [
          {
            title: {
              startsWith: "PM operator delivery smoke",
            },
          },
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
          ...(legacyEventIds.length > 0
            ? [
                {
                  eventId: {
                    in: legacyEventIds,
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
      },
    });
  const notificationIds = smokeNotifications.map((notification) => notification.id);

  const deliveryAttempts = notificationIds.length
    ? await prisma.preventiveMaintenanceNotificationDeliveryAttempt.deleteMany({
        where: {
          notificationIntentId: {
            in: notificationIds,
          },
        },
      })
    : { count: 0 };
  const notifications = notificationIds.length
    ? await prisma.preventiveMaintenanceNotificationIntent.deleteMany({
        where: {
          id: {
            in: notificationIds,
          },
        },
      })
    : { count: 0 };
  const timelines = await prisma.preventiveMaintenanceEventTimeline.deleteMany({
    where:
      legacyEventIds.length > 0
        ? {
            eventId: {
              in: legacyEventIds,
            },
          }
        : {
            id: {
              in: [],
            },
          },
  });
  const events = await prisma.preventiveMaintenanceEvent.deleteMany({
    where:
      legacyEventIds.length > 0
        ? {
            id: {
              in: legacyEventIds,
            },
          }
        : {
            id: {
              in: [],
            },
          },
  });
  const plans = await prisma.preventiveMaintenancePlan.deleteMany({
    where: {
      OR: [
        {
          name: {
            startsWith: "Production PM Smoke Plan",
          },
        },
        {
          name: {
            startsWith: "Production Phase 4A Smoke Plan",
          },
        },
      ],
    },
  });
  const assets = await prisma.assetIdentity.deleteMany({
    where: {
      OR: [
        {
          publicCode: {
            startsWith: "PROD-PM-",
          },
        },
        {
          serialNumber: {
            startsWith: "PM-SMOKE-",
          },
        },
        {
          publicCode: {
            startsWith: "PM-P4A-",
          },
        },
      ],
    },
  });
  const productModels = await prisma.productModel.deleteMany({
    where: {
      OR: [
        {
          name: {
            startsWith: "Production PM Smoke Model",
          },
        },
        {
          modelNumber: {
            startsWith: "PM-SMOKE-",
          },
        },
      ],
    },
  });

  return {
    deliveryAttempts: deliveryAttempts.count,
    notifications: notifications.count,
    timelines: timelines.count,
    events: events.count,
    plans: plans.count,
    assets: assets.count,
    productModels: productModels.count,
  };
}

async function resolveOperator(organizationId) {
  const operator = await prisma.user.findFirst({
    where: {
      organizationId,
      email: DEMO_OPERATOR_EMAIL,
      isActive: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
    },
  });

  assertCondition(
    operator,
    `No active MedCore operator found for ${DEMO_OPERATOR_EMAIL}.`,
  );
  assertCondition(
    operator.role === "manufacturer_admin" ||
      operator.role === "internal_label_admin",
    `MedCore operator ${DEMO_OPERATOR_EMAIL} is not a manufacturer operator.`,
  );

  return operator;
}

async function upsertDemoUser(input) {
  const existing = await prisma.user.findUnique({
    where: {
      clerkId: input.clerkId,
    },
    select: {
      id: true,
    },
  });

  const data = {
    organizationId: input.organizationId,
    email: input.email,
    phone: input.phone,
    name: input.name,
    role: input.role,
    isActive: true,
    metadata: demoMetadata({
      demoEntity: input.demoEntity,
    }),
  };

  if (existing) {
    return prisma.user.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      clerkId: input.clerkId,
      ...data,
    },
    select: {
      id: true,
    },
  });
}

async function upsertProductModel(input) {
  const existing = await prisma.productModel.findFirst({
    where: {
      organizationId: input.organizationId,
      externalItemCode: input.externalItemCode,
    },
    select: {
      id: true,
    },
  });
  const data = {
    organizationId: input.organizationId,
    externalItemCode: input.externalItemCode,
    externalItemSeriesCode: input.externalItemSeriesCode,
    name: input.name,
    category: "Critical Care",
    subCategory: input.subCategory,
    modelNumber: input.modelNumber,
    description: input.description,
    warrantyDurationMonths: 24,
    extendedWarrantyAvailable: true,
    extendedWarrantyMonths: 12,
    specifications: input.specifications,
    requiredSkills: ["preventive_maintenance", "calibration"],
    activationMode: "installation_driven",
    installationOwnershipMode: "dealer_allowed",
    installationRequired: true,
    activationTrigger: "installation_report_submission",
    customerCreationMode: "on_installation",
    customerAcknowledgementRequired: true,
  };

  if (existing) {
    return prisma.productModel.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
        name: true,
        modelNumber: true,
      },
    });
  }

  return prisma.productModel.create({
    data,
    select: {
      id: true,
      name: true,
      modelNumber: true,
    },
  });
}

async function upsertPlan(input) {
  const existing = await prisma.preventiveMaintenancePlan.findFirst({
    where: {
      organizationId: input.organizationId,
      productModelId: input.productModelId,
      name: input.name,
    },
    select: {
      id: true,
    },
  });
  const data = {
    organizationId: input.organizationId,
    productModelId: input.productModelId,
    name: input.name,
    eventType: input.eventType,
    status: "active",
    cadenceType: "interval_days",
    cadenceConfig: {
      intervalDays: input.intervalDays,
    },
    dueSoonThresholdDays: 21,
    customerAcknowledgementRequired: true,
    checklistTemplate: input.checklistTemplate,
    calibrationTemplate: input.calibrationTemplate,
    metadata: demoMetadata({
      demoEntity: "plan",
      storyStep: input.storyStep,
    }),
    createdByUserId: input.createdByUserId,
  };

  if (existing) {
    return prisma.preventiveMaintenancePlan.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
        name: true,
      },
    });
  }

  return prisma.preventiveMaintenancePlan.create({
    data,
    select: {
      id: true,
      name: true,
    },
  });
}

async function upsertAsset(input) {
  const existing = await prisma.assetIdentity.findUnique({
    where: {
      publicCode: input.publicCode,
    },
    select: {
      id: true,
    },
  });
  const data = {
    organizationId: input.organizationId,
    productModelId: input.productModelId,
    productClass: "main_product",
    serialNumber: input.serialNumber,
    lifecycleState: "active",
    warrantyState: "active",
    customerId: input.customerId,
    installationDate: input.installationDate,
    installationLocation: input.installationLocation,
    metadata: demoMetadata({
      demoEntity: "asset",
      careUnit: input.careUnit,
    }),
  };

  if (existing) {
    return prisma.assetIdentity.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
      },
    });
  }

  return prisma.assetIdentity.create({
    data: {
      publicCode: input.publicCode,
      ...data,
    },
    select: {
      id: true,
    },
  });
}

async function upsertEvent(input) {
  const existing = await prisma.preventiveMaintenanceEvent.findUnique({
    where: {
      eventNumber: input.eventNumber,
    },
    select: {
      id: true,
    },
  });
  const data = {
    organizationId: input.organizationId,
    planId: input.planId,
    assetId: input.assetId,
    eventType: input.eventType,
    status: input.status,
    dueDate: input.dueDate,
    scheduledFor: input.scheduledFor,
    assignedServiceCenterId: input.assignedServiceCenterId,
    assignedTechnicianId: input.assignedTechnicianId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    checklistTemplateSnapshot: input.checklistTemplate,
    checklistResponses: input.checklistResponses,
    calibrationTemplateSnapshot: input.calibrationTemplate,
    calibrationReadings: input.calibrationReadings,
    remarks: input.remarks,
    customerAcknowledgementRequired: true,
    customerAcknowledgedAt: input.customerAcknowledgedAt,
    customerAcknowledgementPayload: input.customerAcknowledgementPayload,
    metadata: demoMetadata({
      demoEntity: "event",
      storyStep: input.storyStep,
      demoLabel: input.demoLabel,
    }),
  };

  if (existing) {
    return prisma.preventiveMaintenanceEvent.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
        eventNumber: true,
      },
    });
  }

  return prisma.preventiveMaintenanceEvent.create({
    data: {
      eventNumber: input.eventNumber,
      ...data,
    },
    select: {
      id: true,
      eventNumber: true,
    },
  });
}

async function createLifecycleTimeline(input) {
  const entries = [
    {
      eventType: "generated",
      eventDescription: `${input.demoLabel} generated from ${input.planName}.`,
      createdAt: addDays(input.baseDate, -7),
    },
    ...(input.status === "scheduled" ||
    input.status === "in_progress" ||
    input.status === "completed"
      ? [
          {
            eventType: "scheduled",
            eventDescription: `${input.demoLabel} scheduled with ${input.serviceCenterName}.`,
            createdAt: addDays(input.baseDate, -5),
          },
        ]
      : []),
    ...(input.status === "in_progress" || input.status === "completed"
      ? [
          {
            eventType: "started",
            eventDescription: `${input.technicianName} started ${input.demoLabel}.`,
            createdAt: input.startedAt,
          },
        ]
      : []),
    ...(input.status === "completed"
      ? [
          {
            eventType: "completed",
            eventDescription: `${input.technicianName} completed ${input.demoLabel}.`,
            createdAt: input.completedAt,
          },
        ]
      : []),
  ].filter((entry) => entry.createdAt);

  await prisma.preventiveMaintenanceEventTimeline.deleteMany({
    where: {
      eventId: input.eventId,
      metadata: {
        path: ["demoSeed"],
        equals: DEMO_SEED,
      },
    },
  });

  for (const entry of entries) {
    await createPreventiveMaintenanceTimelineEntry({
      tx: prisma,
      eventId: input.eventId,
      eventType: entry.eventType,
      eventDescription: entry.eventDescription,
      actorUserId: input.operatorId,
      actorRole: "manufacturer_admin",
      actorName: "MedCore Demo Admin",
      metadata: demoMetadata({
        demoEntity: "timeline",
        storyStep: input.storyStep,
      }),
    });
  }
}

async function upsertManufacturerNotification(input) {
  const existing = await prisma.preventiveMaintenanceNotificationIntent.findUnique({
    where: {
      dedupeKey: input.dedupeKey,
    },
    select: {
      id: true,
    },
  });
  const data = {
    eventId: input.eventId,
    organizationId: input.organizationId,
    triggerType: input.triggerType,
    recipientRole: "manufacturer",
    channel: "in_app",
    status: input.status,
    recipientUserId: input.operatorId,
    recipientOrganizationId: input.organizationId,
    title: input.title,
    message: input.message,
    metadata: demoMetadata({
      demoEntity: "manufacturer_notification",
      storyStep: input.storyStep,
      eventNumber: input.eventNumber,
    }),
  };

  if (existing) {
    return prisma.preventiveMaintenanceNotificationIntent.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
      },
    });
  }

  return prisma.preventiveMaintenanceNotificationIntent.create({
    data: {
      dedupeKey: input.dedupeKey,
      ...data,
    },
    select: {
      id: true,
    },
  });
}

async function createDryRunAttempts(input) {
  const rows = input.notifications.flatMap((notification) => [
    {
      notificationIntentId: notification.id,
      organizationId: input.organizationId,
      channel: "email",
      status: "skipped",
      dryRun: true,
      recipientAddress: DEMO_RECIPIENT_EMAIL,
      skipReason: "dry_run",
      attemptNumber: 1,
      dedupeKey: `phase5h:${notification.id}:email:dry-run`,
      metadata: demoMetadata({
        demoEntity: "delivery_attempt",
        channel: "email",
      }),
    },
    {
      notificationIntentId: notification.id,
      organizationId: input.organizationId,
      channel: "sms",
      status: "skipped",
      dryRun: true,
      recipientAddress: DEMO_RECIPIENT_PHONE,
      skipReason: "manufacturer_sms_disabled",
      attemptNumber: 1,
      dedupeKey: `phase5h:${notification.id}:sms:dry-run`,
      metadata: demoMetadata({
        demoEntity: "delivery_attempt",
        channel: "sms",
      }),
    },
  ]);

  await prisma.preventiveMaintenanceNotificationDeliveryAttempt.deleteMany({
    where: {
      notificationIntentId: {
        in: input.notifications.map((notification) => notification.id),
      },
      metadata: {
        path: ["demoSeed"],
        equals: DEMO_SEED,
      },
    },
  });

  if (rows.length === 0) {
    return 0;
  }

  const result =
    await prisma.preventiveMaintenanceNotificationDeliveryAttempt.createMany({
      data: rows,
      skipDuplicates: true,
    });

  return result.count;
}

async function seedDemoRows({ organization, operator }) {
  const today = startOfUtcDay(new Date());
  const installDate = addDays(today, -185);
  const scheduledDate = setUtcTime(addDays(today, 3), 4, 30);
  const activeStartedAt = setUtcTime(addDays(today, -1), 5, 15);
  const completedAt = setUtcTime(addDays(today, -4), 8, 45);
  const completedStartedAt = setUtcTime(addDays(today, -4), 5, 15);

  const serviceOrg =
    (await prisma.organization.findUnique({
      where: {
        slug: DEMO_SERVICE_ORG_SLUG,
      },
      select: {
        id: true,
      },
    })) ??
    (await prisma.organization.create({
      data: {
        name: "MedCore Demo Service Partner",
        type: "service_center",
        slug: DEMO_SERVICE_ORG_SLUG,
        externalCode: "MEDCORE-PM-DEMO-SC",
        city: "Bengaluru",
        state: "Karnataka",
        country: "IN",
        contactEmail: DEMO_RECIPIENT_EMAIL,
        contactPhone: DEMO_RECIPIENT_PHONE,
        settings: demoMetadata({
          demoEntity: "service_organization",
        }),
      },
      select: {
        id: true,
      },
    }));

  await prisma.organization.update({
    where: {
      id: serviceOrg.id,
    },
    data: {
      name: "MedCore Demo Service Partner",
      type: "service_center",
      externalCode: "MEDCORE-PM-DEMO-SC",
      city: "Bengaluru",
      state: "Karnataka",
      country: "IN",
      contactEmail: DEMO_RECIPIENT_EMAIL,
      contactPhone: DEMO_RECIPIENT_PHONE,
      settings: demoMetadata({
        demoEntity: "service_organization",
      }),
    },
  });

  const serviceCenter =
    (await prisma.serviceCenter.findFirst({
      where: {
        organizationId: serviceOrg.id,
        name: "MedCore Demo Bengaluru Service Hub",
      },
      select: {
        id: true,
      },
    })) ??
    (await prisma.serviceCenter.create({
      data: {
        organizationId: serviceOrg.id,
        name: "MedCore Demo Bengaluru Service Hub",
        address: "Indiranagar clinical support desk",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
        phone: DEMO_RECIPIENT_PHONE,
        email: DEMO_RECIPIENT_EMAIL,
        serviceRadiusKm: 80,
        supportedCategories: ["Critical Care"],
        manufacturerAuthorizations: [organization.id],
        isActive: true,
      },
      select: {
        id: true,
      },
    }));

  await prisma.serviceCenter.update({
    where: {
      id: serviceCenter.id,
    },
    data: {
      address: "Indiranagar clinical support desk",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
      phone: DEMO_RECIPIENT_PHONE,
      email: DEMO_RECIPIENT_EMAIL,
      serviceRadiusKm: 80,
      supportedCategories: ["Critical Care"],
      manufacturerAuthorizations: [organization.id],
      isActive: true,
    },
  });

  const technicianUser = await upsertDemoUser({
    clerkId: "phase5h_medcore_demo_technician",
    organizationId: serviceOrg.id,
    email: "medcore-demo-technician@feedbacknfc.test",
    phone: DEMO_RECIPIENT_PHONE,
    name: "Ravi Kumar",
    role: "field_technician",
    demoEntity: "technician_user",
  });
  const customerUser = await upsertDemoUser({
    clerkId: "phase5h_medcore_demo_customer",
    organizationId: null,
    email: "biomed-demo-contact@feedbacknfc.test",
    phone: "+919900000102",
    name: "Dr. Ananya Rao",
    role: "customer",
    demoEntity: "customer_user",
  });

  const technician =
    (await prisma.technician.findUnique({
      where: {
        userId: technicianUser.id,
      },
      select: {
        id: true,
      },
    })) ??
    (await prisma.technician.create({
      data: {
        userId: technicianUser.id,
        serviceCenterId: serviceCenter.id,
        name: "Ravi Kumar",
        phone: DEMO_RECIPIENT_PHONE,
        skills: ["preventive_maintenance", "calibration", "critical_care"],
        isAvailable: true,
      },
      select: {
        id: true,
      },
    }));

  await prisma.technician.update({
    where: {
      id: technician.id,
    },
    data: {
      serviceCenterId: serviceCenter.id,
      name: "Ravi Kumar",
      phone: DEMO_RECIPIENT_PHONE,
      skills: ["preventive_maintenance", "calibration", "critical_care"],
      isAvailable: true,
    },
  });

  const productModels = await Promise.all([
    upsertProductModel({
      organizationId: organization.id,
      externalItemCode: `${DEMO_EXTERNAL_PREFIX}-ICU-MX700`,
      externalItemSeriesCode: `${DEMO_EXTERNAL_PREFIX}-ICU`,
      name: "MedCore ICU Monitor MX-700",
      subCategory: "Patient monitoring",
      modelNumber: "MX-700",
      description: "Multi-parameter ICU monitor configured for PM demo.",
      specifications: {
        channels: "ECG, SpO2, NIBP, temperature",
        batteryBackup: "4 hours",
      },
    }),
    upsertProductModel({
      organizationId: organization.id,
      externalItemCode: `${DEMO_EXTERNAL_PREFIX}-VENT-VX900`,
      externalItemSeriesCode: `${DEMO_EXTERNAL_PREFIX}-VENT`,
      name: "MedCore Ventilator VX-900",
      subCategory: "Respiratory support",
      modelNumber: "VX-900",
      description: "Critical-care ventilator configured for PM demo.",
      specifications: {
        modes: "VCV, PCV, SIMV, CPAP",
        compressor: "Integrated",
      },
    }),
    upsertProductModel({
      organizationId: organization.id,
      externalItemCode: `${DEMO_EXTERNAL_PREFIX}-PUMP-IP300`,
      externalItemSeriesCode: `${DEMO_EXTERNAL_PREFIX}-PUMP`,
      name: "MedCore Infusion Pump IP-300",
      subCategory: "Infusion therapy",
      modelNumber: "IP-300",
      description: "Infusion pump configured for PM demo.",
      specifications: {
        channels: "Single",
        flowRange: "0.1-1200 ml/h",
      },
    }),
  ]);

  const checklistTemplate = [
    {
      id: "visual-inspection",
      label: "Visual inspection completed",
      required: true,
    },
    {
      id: "safety-check",
      label: "Electrical safety check passed",
      required: true,
    },
    {
      id: "functional-test",
      label: "Functional test completed",
      required: true,
    },
  ];
  const calibrationTemplate = [
    {
      id: "baseline",
      label: "Baseline reading",
      unit: "pass/fail",
      required: true,
    },
    {
      id: "sensor-drift",
      label: "Sensor drift",
      unit: "%",
      required: false,
    },
  ];

  const plans = await Promise.all(
    productModels.map((model, index) =>
      upsertPlan({
        organizationId: organization.id,
        productModelId: model.id,
        name:
          index === 1
            ? "Quarterly critical-care calibration"
            : "Quarterly preventive maintenance",
        eventType: index === 1 ? "calibration" : "preventive_maintenance",
        intervalDays: 90,
        checklistTemplate,
        calibrationTemplate,
        createdByUserId: operator.id,
        storyStep: ["upcoming", "active", "completed"][index],
      }),
    ),
  );

  const assets = await Promise.all([
    upsertAsset({
      organizationId: organization.id,
      productModelId: productModels[0].id,
      publicCode: "MCORE-PM-DEMO-ICU-001",
      serialNumber: "MCORE-MX700-2401",
      customerId: customerUser.id,
      installationDate: installDate,
      installationLocation: {
        facility: "MedCore Demo Hospital",
        department: "ICU Ward A",
        city: "Bengaluru",
      },
      careUnit: "ICU Ward A",
    }),
    upsertAsset({
      organizationId: organization.id,
      productModelId: productModels[1].id,
      publicCode: "MCORE-PM-DEMO-VENT-002",
      serialNumber: "MCORE-VX900-2402",
      customerId: customerUser.id,
      installationDate: addDays(installDate, -12),
      installationLocation: {
        facility: "MedCore Demo Hospital",
        department: "Critical Care Bay 2",
        city: "Bengaluru",
      },
      careUnit: "Critical Care Bay 2",
    }),
    upsertAsset({
      organizationId: organization.id,
      productModelId: productModels[2].id,
      publicCode: "MCORE-PM-DEMO-PUMP-003",
      serialNumber: "MCORE-IP300-2403",
      customerId: customerUser.id,
      installationDate: addDays(installDate, -30),
      installationLocation: {
        facility: "MedCore Demo Hospital",
        department: "Step-down Unit",
        city: "Bengaluru",
      },
      careUnit: "Step-down Unit",
    }),
  ]);

  const events = await Promise.all([
    upsertEvent({
      organizationId: organization.id,
      eventNumber: "MCOREPM-001",
      planId: plans[0].id,
      assetId: assets[0].id,
      eventType: "preventive_maintenance",
      status: "scheduled",
      dueDate: addDays(today, 7),
      scheduledFor: scheduledDate,
      assignedServiceCenterId: serviceCenter.id,
      assignedTechnicianId: technician.id,
      startedAt: null,
      completedAt: null,
      checklistTemplate,
      checklistResponses: [],
      calibrationTemplate,
      calibrationReadings: [],
      remarks: "Demo: upcoming ICU monitor PM scheduled with service partner.",
      customerAcknowledgedAt: null,
      customerAcknowledgementPayload: null,
      storyStep: "upcoming_scheduled",
      demoLabel: "ICU monitor preventive maintenance",
    }),
    upsertEvent({
      organizationId: organization.id,
      eventNumber: "MCOREPM-002",
      planId: plans[1].id,
      assetId: assets[1].id,
      eventType: "calibration",
      status: "in_progress",
      dueDate: addDays(today, -1),
      scheduledFor: setUtcTime(addDays(today, -1), 4, 30),
      assignedServiceCenterId: serviceCenter.id,
      assignedTechnicianId: technician.id,
      startedAt: activeStartedAt,
      completedAt: null,
      checklistTemplate,
      checklistResponses: [
        {
          id: "visual-inspection",
          value: true,
          note: "Demo inspection started.",
        },
      ],
      calibrationTemplate,
      calibrationReadings: [
        {
          id: "baseline",
          value: "pass",
          capturedAt: activeStartedAt.toISOString(),
        },
      ],
      remarks: "Demo: ventilator calibration currently in progress.",
      customerAcknowledgedAt: null,
      customerAcknowledgementPayload: null,
      storyStep: "active_in_progress",
      demoLabel: "ventilator calibration",
    }),
    upsertEvent({
      organizationId: organization.id,
      eventNumber: "MCOREPM-003",
      planId: plans[2].id,
      assetId: assets[2].id,
      eventType: "preventive_maintenance",
      status: "completed",
      dueDate: addDays(today, -5),
      scheduledFor: setUtcTime(addDays(today, -4), 4, 30),
      assignedServiceCenterId: serviceCenter.id,
      assignedTechnicianId: technician.id,
      startedAt: completedStartedAt,
      completedAt,
      checklistTemplate,
      checklistResponses: checklistTemplate.map((item) => ({
        id: item.id,
        value: true,
        note: "Completed for demo cycle.",
      })),
      calibrationTemplate,
      calibrationReadings: [
        {
          id: "baseline",
          value: "pass",
          capturedAt: completedAt.toISOString(),
        },
        {
          id: "sensor-drift",
          value: "0.8",
          capturedAt: completedAt.toISOString(),
        },
      ],
      remarks: "Demo: infusion pump PM completed and customer acknowledged.",
      customerAcknowledgedAt: completedAt,
      customerAcknowledgementPayload: {
        acknowledgementMethod: "demo_seed",
        typedCustomerName: "Dr. Ananya Rao",
        typedCustomerPhone: "+919900000102",
        source: "manual",
        acknowledgedAt: completedAt.toISOString(),
      },
      storyStep: "completed",
      demoLabel: "infusion pump preventive maintenance",
    }),
  ]);

  for (const [index, event] of events.entries()) {
    await createLifecycleTimeline({
      eventId: event.id,
      operatorId: operator.id,
      planName: plans[index].name,
      demoLabel: [
        "ICU monitor preventive maintenance",
        "ventilator calibration",
        "infusion pump preventive maintenance",
      ][index],
      serviceCenterName: "MedCore Demo Bengaluru Service Hub",
      technicianName: "Ravi Kumar",
      status: ["scheduled", "in_progress", "completed"][index],
      baseDate: [scheduledDate, activeStartedAt, completedAt][index],
      startedAt: [null, activeStartedAt, completedStartedAt][index],
      completedAt: [null, null, completedAt][index],
      storyStep: ["upcoming_scheduled", "active_in_progress", "completed"][
        index
      ],
    });
  }

  for (const [index, event] of events.entries()) {
    await createPreventiveMaintenanceNotificationIntentsForEvent({
      tx: prisma,
      eventId: event.id,
      triggerType: ["scheduled", "started", "completed"][index],
      metadata: demoMetadata({
        demoEntity: "recipient_notification",
        storyStep: ["upcoming_scheduled", "active_in_progress", "completed"][
          index
        ],
      }),
    });
  }

  const manufacturerNotifications = await Promise.all([
    upsertManufacturerNotification({
      eventId: events[0].id,
      organizationId: organization.id,
      operatorId: operator.id,
      eventNumber: events[0].eventNumber,
      triggerType: "scheduled",
      status: "pending",
      title: "Demo PM scheduled: ICU monitor",
      message:
        "MedCore Demo Bengaluru Service Hub is scheduled for ICU monitor preventive maintenance.",
      dedupeKey: `phase5h:${events[0].id}:manufacturer:scheduled`,
      storyStep: "upcoming_scheduled",
    }),
    upsertManufacturerNotification({
      eventId: events[1].id,
      organizationId: organization.id,
      operatorId: operator.id,
      eventNumber: events[1].eventNumber,
      triggerType: "started",
      status: "pending",
      title: "Demo PM in progress: ventilator calibration",
      message:
        "Ravi Kumar has started the ventilator calibration demo work order.",
      dedupeKey: `phase5h:${events[1].id}:manufacturer:started`,
      storyStep: "active_in_progress",
    }),
    upsertManufacturerNotification({
      eventId: events[2].id,
      organizationId: organization.id,
      operatorId: operator.id,
      eventNumber: events[2].eventNumber,
      triggerType: "completed",
      status: "delivered",
      title: "Demo PM completed: infusion pump",
      message:
        "The infusion pump preventive maintenance demo event has been completed and acknowledged.",
      dedupeKey: `phase5h:${events[2].id}:manufacturer:completed`,
      storyStep: "completed",
    }),
  ]);

  const dryRunAttempts = await createDryRunAttempts({
    organizationId: organization.id,
    notifications: manufacturerNotifications,
  });

  return {
    serviceOrganizationId: serviceOrg.id,
    serviceCenterId: serviceCenter.id,
    technicianId: technician.id,
    customerUserId: customerUser.id,
    productModelIds: productModels.map((model) => model.id),
    assetIds: assets.map((asset) => asset.id),
    planIds: plans.map((plan) => plan.id),
    events,
    manufacturerNotificationIds: manufacturerNotifications.map(
      (notification) => notification.id,
    ),
    dryRunAttempts,
  };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  const target = parseDatabaseTarget();
  if (target.isProductionLike && !args.allowProduction) {
    throw new Error(
      "Refusing production-like public database without --allow-production.",
    );
  }
  if ((args.reset || !args.seed) && !args.confirmReset) {
    throw new Error(
      "Demo reset requires --confirm-medcore-demo-reset.",
    );
  }
  if (args.cleanupOldSmoke && !args.confirmCleanupOldSmoke) {
    throw new Error(
      "Old smoke cleanup requires --confirm-cleanup-old-smoke.",
    );
  }

  const organization = await verifyMedCoreOrganization(args.organizationId);
  const operator = await resolveOperator(organization.id);
  const existingDemoRows = await countExistingDemoRows();

  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          dryRun: true,
          target,
          organization,
          operator,
          existingDemoRows,
          planned: {
            reset: args.reset || !args.seed,
            seed: args.seed,
            cleanupOldSmoke: args.cleanupOldSmoke,
          },
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const reset = args.reset || !args.seed ? await resetDemoRows() : null;
  const oldSmokeCleanup = args.cleanupOldSmoke
    ? await cleanupOldOperatorSmoke()
    : null;
  const seed = args.seed
    ? await seedDemoRows({
        organization,
        operator,
      })
    : null;

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        target,
        organization,
        operator,
        existingDemoRows,
        reset,
        oldSmokeCleanup,
        seed,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `seed-medcore-pm-demo failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

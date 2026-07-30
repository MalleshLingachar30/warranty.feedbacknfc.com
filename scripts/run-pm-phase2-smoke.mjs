#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { PrismaClient } from "@prisma/client";

import { generatePreventiveMaintenanceEventsForAsset } from "../src/lib/preventive-maintenance.ts";

const require = createRequire(import.meta.url);
const { assertSafeE2EDatabase } = require("./lib/e2e-db-guard.js");

function runId() {
  return `pm-phase2-${Date.now().toString(36)}`;
}

function toSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  assertSafeE2EDatabase({ scope: "run-pm-phase2-smoke.mjs" });

  const prisma = new PrismaClient();
  const id = runId();
  const created = {
    manufacturerOrgId: null,
    serviceCenterOrgId: null,
  };

  try {
    const manufacturer = await prisma.organization.create({
      data: {
        name: `PM Phase 2 Manufacturer ${id}`,
        type: "manufacturer",
        slug: toSlug(`PM Phase 2 Manufacturer ${id}`),
      },
      select: {
        id: true,
      },
    });
    created.manufacturerOrgId = manufacturer.id;

    const serviceCenterOrg = await prisma.organization.create({
      data: {
        name: `PM Phase 2 Service Org ${id}`,
        type: "service_center",
        slug: toSlug(`PM Phase 2 Service Org ${id}`),
      },
      select: {
        id: true,
      },
    });
    created.serviceCenterOrgId = serviceCenterOrg.id;

    const [manufacturerUser, technicianUser] = await Promise.all([
      prisma.user.create({
        data: {
          clerkId: `pm_phase2_admin_${id}`,
          organizationId: manufacturer.id,
          email: `pm-phase2-admin-${id}@example.test`,
          name: "PM Phase 2 Admin",
          role: "manufacturer_admin",
        },
        select: {
          id: true,
        },
      }),
      prisma.user.create({
        data: {
          clerkId: `pm_phase2_tech_${id}`,
          organizationId: serviceCenterOrg.id,
          email: `pm-phase2-tech-${id}@example.test`,
          name: "PM Phase 2 Technician",
          phone: "+15550101010",
          role: "field_technician",
        },
        select: {
          id: true,
        },
      }),
    ]);

    const serviceCenter = await prisma.serviceCenter.create({
      data: {
        organizationId: serviceCenterOrg.id,
        name: `PM Phase 2 Center ${id}`,
        city: "Bengaluru",
        manufacturerAuthorizations: [manufacturer.id],
      },
      select: {
        id: true,
      },
    });

    const technician = await prisma.technician.create({
      data: {
        userId: technicianUser.id,
        serviceCenterId: serviceCenter.id,
        name: "PM Phase 2 Technician",
        phone: "+15550101010",
        skills: ["preventive_maintenance", "calibration"],
      },
      select: {
        id: true,
      },
    });

    const productModel = await prisma.productModel.create({
      data: {
        organizationId: manufacturer.id,
        name: `PM Phase 2 Model ${id}`,
        category: "medical",
        modelNumber: `PM2-${id}`,
        warrantyDurationMonths: 6,
        activationMode: "installation_driven",
        activationTrigger: "installation_report_submission",
        installationRequired: true,
      },
      select: {
        id: true,
      },
    });

    const asset = await prisma.assetIdentity.create({
      data: {
        publicCode: `PM2-ASSET-${id}`,
        organizationId: manufacturer.id,
        productModelId: productModel.id,
        productClass: "main_product",
        serialNumber: `PM2-SERIAL-${id}`,
        lifecycleState: "active",
        warrantyState: "active",
        installationDate: new Date("2026-01-15T00:00:00.000Z"),
      },
      select: {
        id: true,
      },
    });

    const plan = await prisma.preventiveMaintenancePlan.create({
      data: {
        organizationId: manufacturer.id,
        productModelId: productModel.id,
        name: "Quarterly PM",
        eventType: "preventive_maintenance",
        cadenceType: "interval_days",
        cadenceConfig: {
          intervalDays: 90,
        },
        customerAcknowledgementRequired: true,
        checklistTemplate: [
          {
            id: "visual",
            label: "Visual inspection complete",
            required: true,
          },
        ],
        createdByUserId: manufacturerUser.id,
      },
      select: {
        id: true,
      },
    });

    const firstGeneration = await prisma.$transaction((tx) =>
      generatePreventiveMaintenanceEventsForAsset({
        tx,
        assetId: asset.id,
        warrantyEndDate: new Date("2026-07-15T00:00:00.000Z"),
        generationSource: "manual_regeneration",
      }),
    );

    assert.equal(firstGeneration.activePlanCount, 1);
    assert.equal(firstGeneration.generatedEventCount, 2);
    assert.equal(firstGeneration.skippedEventCount, 0);

    const firstEvent = await prisma.preventiveMaintenanceEvent.findFirstOrThrow(
      {
        where: {
          assetId: asset.id,
          planId: plan.id,
        },
        orderBy: {
          dueDate: "asc",
        },
        select: {
          id: true,
          dueDate: true,
          eventNumber: true,
        },
      },
    );

    assert.equal(firstEvent.eventNumber, "PM-000001");
    assert.equal(firstEvent.dueDate.toISOString(), "2026-04-15T00:00:00.000Z");

    const scheduledFor = new Date("2026-04-10T09:30:00.000Z");
    const assignedEvent = await prisma.preventiveMaintenanceEvent.update({
      where: {
        id: firstEvent.id,
      },
      data: {
        assignedServiceCenterId: serviceCenter.id,
        assignedTechnicianId: technician.id,
        scheduledFor,
        status: "scheduled",
      },
      select: {
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
        scheduledFor: true,
        status: true,
      },
    });

    assert.equal(assignedEvent.assignedServiceCenterId, serviceCenter.id);
    assert.equal(assignedEvent.assignedTechnicianId, technician.id);
    assert.equal(
      assignedEvent.scheduledFor?.toISOString(),
      scheduledFor.toISOString(),
    );
    assert.equal(assignedEvent.status, "scheduled");

    const visibleToServiceCenter =
      await prisma.preventiveMaintenanceEvent.count({
        where: {
          id: firstEvent.id,
          assignedServiceCenter: {
            organizationId: serviceCenterOrg.id,
          },
        },
      });
    assert.equal(visibleToServiceCenter, 1);

    const cancelled = await prisma.preventiveMaintenanceEvent.update({
      where: {
        id: firstEvent.id,
      },
      data: {
        status: "cancelled",
        cancelledAt: new Date("2026-04-09T12:00:00.000Z"),
        cancellationReason: "PM Phase 2 smoke cancellation",
      },
      select: {
        status: true,
        cancelledAt: true,
        cancellationReason: true,
      },
    });

    assert.equal(cancelled.status, "cancelled");
    assert(cancelled.cancelledAt);
    assert.equal(cancelled.cancellationReason, "PM Phase 2 smoke cancellation");

    const secondGeneration = await prisma.$transaction((tx) =>
      generatePreventiveMaintenanceEventsForAsset({
        tx,
        assetId: asset.id,
        warrantyEndDate: new Date("2026-07-15T00:00:00.000Z"),
        generationSource: "manual_regeneration",
      }),
    );

    assert.equal(secondGeneration.generatedEventCount, 0);
    assert.equal(
      secondGeneration.skipped.filter(
        (entry) => entry.reason === "already_exists",
      ).length,
      2,
    );

    const finalEventCount = await prisma.preventiveMaintenanceEvent.count({
      where: {
        assetId: asset.id,
      },
    });
    assert.equal(finalEventCount, 2);

    console.log(
      JSON.stringify(
        {
          generatedEventCount: firstGeneration.generatedEventCount,
          idempotentGeneratedEventCount: secondGeneration.generatedEventCount,
          serviceCenterVisibleEventCount: visibleToServiceCenter,
          finalEventCount,
        },
        null,
        2,
      ),
    );
  } finally {
    if (created.manufacturerOrgId) {
      await prisma.preventiveMaintenanceEvent.deleteMany({
        where: {
          organizationId: created.manufacturerOrgId,
        },
      });
      await prisma.preventiveMaintenancePlan.deleteMany({
        where: {
          organizationId: created.manufacturerOrgId,
        },
      });
      await prisma.assetIdentity.deleteMany({
        where: {
          organizationId: created.manufacturerOrgId,
        },
      });
      await prisma.productModel.deleteMany({
        where: {
          organizationId: created.manufacturerOrgId,
        },
      });
      await prisma.user.deleteMany({
        where: {
          organizationId: created.manufacturerOrgId,
        },
      });
      await prisma.organization.deleteMany({
        where: {
          id: created.manufacturerOrgId,
        },
      });
    }

    if (created.serviceCenterOrgId) {
      await prisma.technician.deleteMany({
        where: {
          serviceCenter: {
            organizationId: created.serviceCenterOrgId,
          },
        },
      });
      await prisma.serviceCenter.deleteMany({
        where: {
          organizationId: created.serviceCenterOrgId,
        },
      });
      await prisma.user.deleteMany({
        where: {
          organizationId: created.serviceCenterOrgId,
        },
      });
      await prisma.organization.deleteMany({
        where: {
          id: created.serviceCenterOrgId,
        },
      });
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nPM Phase 2 smoke test failed:");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});

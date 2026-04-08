#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");
const { assertSafeE2EDatabase } = require("./lib/e2e-db-guard");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  assertSafeE2EDatabase({ scope: "seed-e2e.js" });

  const prisma = new PrismaClient();
  try {
    const runId = `e2e-${Date.now()}`;
    const stickerNumber =
      Number(process.env.E2E_STICKER_NUMBER) || randomInt(900000, 999999);

    const organizationId = crypto.randomUUID();
    const productModelId = crypto.randomUUID();
    const stickerId = crypto.randomUUID();
    const productId = crypto.randomUUID();

    const organizationName = `E2E Manufacturer ${runId}`;
    const organizationSlug = toSlug(organizationName);

    await prisma.organization.create({
      data: {
        id: organizationId,
        name: organizationName,
        type: "manufacturer",
        slug: organizationSlug,
        contactEmail: `qa+${runId}@example.com`,
        contactPhone: "+15550001111",
      },
    });

    await prisma.productModel.create({
      data: {
        id: productModelId,
        organizationId,
        name: `E2E Water Purifier ${runId}`,
        category: "water_purifier",
        modelNumber: `E2E-${runId}`,
        warrantyDurationMonths: 12,
        requiredSkills: ["filter_replacement", "pump_repair"],
        commonIssues: ["Low flow", "Water leakage"],
      },
    });

    await prisma.sticker.create({
      data: {
        id: stickerId,
        stickerNumber,
        stickerSerial: `FNFC-${String(stickerNumber).padStart(6, "0")}`,
        type: "nfc_qr",
        variant: "standard",
        status: "bound",
        allocatedToOrgId: organizationId,
        batchId: `BATCH-${runId}`,
      },
    });

    await prisma.product.create({
      data: {
        id: productId,
        stickerId,
        productModelId,
        organizationId,
        serialNumber: `SER-${runId}`,
        warrantyStatus: "pending_activation",
        metadata: { seedRun: runId },
      },
    });

    const payload = {
      runId,
      organizationId,
      productModelId,
      stickerId,
      stickerNumber,
      productId,
    };

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error("E2E seed failed:", error);
    process.exitCode = 1;
  });

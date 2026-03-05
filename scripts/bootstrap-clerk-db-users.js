#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Bootstrap DB `users` rows for existing Clerk users.
 *
 * Why:
 * - Dashboards resolve organization context via DB `users.organizationId`.
 * - In production, manufacturer/service-center dashboards require this mapping.
 *
 * Usage (recommended):
 *   node scripts/bootstrap-clerk-db-users.js --config /tmp/clerk-users.json
 *
 * Example config:
 * {
 *   "defaults": {
 *     "manufacturerOrgId": "e4305e01-3bab-4a9f-b295-c9aa1f4ad226",
 *     "serviceCenterOrgId": null
 *   },
 *   "users": [
 *     { "clerkId": "user_xxx", "email": "ml+super@feedbacknfc.com", "name": "ml super", "role": "super_admin" },
 *     { "clerkId": "user_xxx", "email": "ml+mfg@feedbacknfc.com", "name": "ml mfg", "role": "manufacturer_admin" },
 *     { "clerkId": "user_xxx", "email": "ml+sc@feedbacknfc.com", "name": "ml sc", "role": "service_center_admin" },
 *     { "clerkId": "user_xxx", "email": "ml+tech@feedbacknfc.com", "name": "ml tech", "role": "technician" },
 *     { "clerkId": "user_xxx", "email": "ml+customer@feedbacknfc.com", "name": "ml customer", "role": "customer" }
 *   ]
 * }
 *
 * Notes:
 * - For manufacturer admins, `organizationId` defaults to `defaults.manufacturerOrgId`.
 * - For service-center admins/technicians, `organizationId` defaults to `defaults.serviceCenterOrgId`.
 * - You can override per user by specifying `organizationId` in the user record.
 */

const fs = require("node:fs");
const path = require("node:path");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const USER_ROLES = new Set([
  "super_admin",
  "manufacturer_admin",
  "service_center_admin",
  "technician",
  "customer",
]);

function printUsageAndExit(exitCode) {
  const examplePath = "/tmp/clerk-users.json";
  process.stderr.write(
    [
      "",
      "Bootstrap DB users from Clerk IDs",
      "",
      "Required:",
      "  --config <path-to-json>",
      "",
      `Example:`,
      `  node scripts/bootstrap-clerk-db-users.js --config ${examplePath}`,
      "",
      "Config shape:",
      "  { defaults: { manufacturerOrgId?: string, serviceCenterOrgId?: string|null }, users: UserInput[] }",
      "",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { config: null };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      printUsageAndExit(0);
    }

    if (token === "--config") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        process.stderr.write("Missing value for --config\n");
        printUsageAndExit(1);
      }
      args.config = next;
      i += 1;
      continue;
    }

    process.stderr.write(`Unknown argument: ${token}\n`);
    printUsageAndExit(1);
  }

  return args;
}

function asString(value) {
  return typeof value === "string" ? value : null;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateRole(role) {
  if (!USER_ROLES.has(role)) {
    throw new Error(
      `Invalid role '${role}'. Must be one of: ${[...USER_ROLES].join(", ")}`,
    );
  }
  return role;
}

function inferOrganizationId({ role, explicitOrgId, defaults }) {
  if (explicitOrgId) {
    return explicitOrgId;
  }

  if (role === "manufacturer_admin") {
    return defaults.manufacturerOrgId ?? null;
  }

  if (role === "service_center_admin" || role === "technician") {
    return defaults.serviceCenterOrgId ?? null;
  }

  return null;
}

async function upsertUserRecord(input, defaults) {
  const clerkId = normalizeOptionalString(input.clerkId);
  if (!clerkId) {
    throw new Error("Missing clerkId for user record.");
  }

  const role = validateRole(String(input.role ?? ""));
  const email = normalizeOptionalString(input.email);
  const phone = normalizeOptionalString(input.phone);
  const name = normalizeOptionalString(input.name);
  const organizationId = inferOrganizationId({
    role,
    explicitOrgId: normalizeOptionalString(input.organizationId),
    defaults,
  });

  const record = await prisma.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      role,
      organizationId,
      email,
      phone,
      name,
    },
    update: {
      role,
      organizationId,
      email,
      phone,
      name,
    },
    select: {
      id: true,
      clerkId: true,
      email: true,
      role: true,
      organizationId: true,
    },
  });

  return record;
}

async function ensureDefaultOrganizations(users, defaults) {
  const needsManufacturerOrg = users.some((user) => {
    const role = asString(user?.role);
    const explicitOrgId = normalizeOptionalString(user?.organizationId);
    return role === "manufacturer_admin" && !explicitOrgId;
  });

  const needsServiceCenterOrg = users.some((user) => {
    const role = asString(user?.role);
    const explicitOrgId = normalizeOptionalString(user?.organizationId);
    return (
      (role === "service_center_admin" || role === "technician") && !explicitOrgId
    );
  });

  const resolvedDefaults = { ...defaults };
  const diagnostics = {
    manufacturerOrg: {
      provided: Boolean(defaults.manufacturerOrgId),
      resolved: defaults.manufacturerOrgId ?? null,
      created: false,
    },
    serviceCenterOrg: {
      provided: Boolean(defaults.serviceCenterOrgId),
      resolved: defaults.serviceCenterOrgId ?? null,
      created: false,
    },
  };

  if (needsManufacturerOrg && !resolvedDefaults.manufacturerOrgId) {
    const existing = await prisma.organization.findFirst({
      where: { type: "manufacturer" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (existing) {
      resolvedDefaults.manufacturerOrgId = existing.id;
      diagnostics.manufacturerOrg.resolved = existing.id;
    }
  }

  if (needsServiceCenterOrg && !resolvedDefaults.serviceCenterOrgId) {
    const existing = await prisma.organization.findFirst({
      where: { type: "service_center" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (existing) {
      resolvedDefaults.serviceCenterOrgId = existing.id;
      diagnostics.serviceCenterOrg.resolved = existing.id;
    } else {
      const created = await prisma.organization.create({
        data: {
          name: `E2E Service Center ${new Date().toISOString().slice(0, 10)}`,
          type: "service_center",
        },
        select: { id: true },
      });

      resolvedDefaults.serviceCenterOrgId = created.id;
      diagnostics.serviceCenterOrg.resolved = created.id;
      diagnostics.serviceCenterOrg.created = true;
    }
  }

  return { defaults: resolvedDefaults, diagnostics };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.config) {
    process.stderr.write("Missing required --config\n");
    printUsageAndExit(1);
  }

  const configPath = path.resolve(process.cwd(), args.config);
  if (!fs.existsSync(configPath)) {
    process.stderr.write(`Config file not found: ${configPath}\n`);
    printUsageAndExit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to parse JSON config file: ${configPath}. ${error instanceof Error ? error.message : ""}`,
    );
  }

  const defaults = {
    manufacturerOrgId: normalizeOptionalString(config?.defaults?.manufacturerOrgId),
    serviceCenterOrgId: normalizeOptionalString(config?.defaults?.serviceCenterOrgId),
  };

  const users = Array.isArray(config?.users) ? config.users : null;
  if (!users || users.length === 0) {
    throw new Error("Config must include a non-empty users array.");
  }

  const ensured = await ensureDefaultOrganizations(users, defaults);

  const results = [];
  for (const userInput of users) {
    results.push(await upsertUserRecord(userInput, ensured.defaults));
  }

  process.stdout.write(
    `${JSON.stringify(
      { success: true, defaults: ensured.defaults, diagnostics: ensured.diagnostics, results },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `bootstrap-clerk-db-users failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

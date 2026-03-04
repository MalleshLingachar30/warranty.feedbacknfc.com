#!/usr/bin/env node

const { execSync } = require("node:child_process");

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function apiRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, options);
  const raw = await response.text();

  let json = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = raw;
    }
  }

  return {
    url,
    status: response.status,
    json,
  };
}

function pretty(label, result) {
  console.log(`\n[${label}] ${result.url}`);
  console.log(`status: ${result.status}`);
  console.log("body:", JSON.stringify(result.json, null, 2));
}

async function main() {
  console.log("Using base URL:", baseUrl);

  if (process.env.E2E_SKIP_DB_PUSH === "1") {
    console.log("\n1) Skipping prisma db push (E2E_SKIP_DB_PUSH=1)...");
  } else {
    console.log("\n1) Ensuring database schema is applied (prisma db push)...");
    try {
      execSync(
        "npm_config_cache=/tmp/.npm-cache npx prisma db push --skip-generate",
        {
          stdio: "inherit",
          env: process.env,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('prepared statement "s0" already exists')) {
        console.warn(
          "\nWarning: prisma db push hit a transient prepared-statement conflict. Continuing with existing schema.",
        );
      } else {
        throw error;
      }
    }
  }

  console.log("\n2) Seeding E2E fixture data...");
  const seedOutput = execSync("node scripts/seed-e2e.js", {
    encoding: "utf8",
    env: process.env,
  });
  const seed = JSON.parse(seedOutput);
  console.log("Seed payload:", JSON.stringify(seed, null, 2));

  console.log("\n3) Sticker lookup (pre-ticket)...");
  const lookup1 = await apiRequest(
    `/api/sticker/lookup?number=${seed.stickerNumber}`,
  );
  pretty("sticker-lookup-initial", lookup1);
  assert(lookup1.status === 200, "Sticker lookup should return 200");
  assert(
    lookup1.json?.sticker?.stickerNumber === seed.stickerNumber,
    "Sticker number mismatch",
  );
  assert(
    lookup1.json?.product?.id === seed.productId,
    "Product mismatch from lookup",
  );
  assert(
    lookup1.json?.openTicket === null,
    "Expected no open ticket before ticket creation",
  );

  console.log("\n4) Warranty activation...");
  const activate = await apiRequest("/api/warranty/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      productId: seed.productId,
      customerName: "E2E Customer",
      customerPhone: "+1 (555) 123-1234",
      customerEmail: "e2e.customer@example.com",
      customerAddress: "221B API Street",
      installationDate: "2026-03-04",
    }),
  });
  pretty("warranty-activation", activate);
  assert(activate.status === 200, "Warranty activation should return 200");
  assert(
    activate.json?.success === true,
    "Warranty activation success should be true",
  );

  console.log("\n5) Ticket creation...");
  const createTicket = await apiRequest("/api/ticket/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      productId: seed.productId,
      issueCategory: "water_leak",
      issueDescription: "E2E: Water is leaking from bottom panel.",
      issuePhotos: ["https://example.com/e2e-photo.jpg"],
      reportedByName: "E2E Customer",
      reportedByPhone: "+1 (555) 123-1234",
    }),
  });
  pretty("ticket-create", createTicket);
  assert(createTicket.status === 201, "Ticket creation should return 201");
  assert(
    createTicket.json?.success === true,
    "Ticket creation success should be true",
  );
  const ticketId = createTicket.json?.ticket?.id;
  assert(ticketId, "Ticket id missing from create response");

  console.log(
    "\n6) Sticker lookup (post-ticket) should include open ticket...",
  );
  const lookup2 = await apiRequest(
    `/api/sticker/lookup?number=${seed.stickerNumber}`,
  );
  pretty("sticker-lookup-open-ticket", lookup2);
  assert(
    lookup2.status === 200,
    "Sticker lookup (post-ticket) should return 200",
  );
  assert(
    lookup2.json?.openTicket?.id === ticketId,
    "Open ticket mismatch after creation",
  );

  console.log("\n7) Ticket confirm...\n");
  const confirm = await apiRequest(`/api/ticket/${ticketId}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "confirm", comment: "E2E confirm path" }),
  });
  pretty("ticket-confirm", confirm);
  assert(confirm.status === 200, "Ticket confirm should return 200");
  assert(
    confirm.json?.ticket?.status === "resolved",
    "Ticket should be resolved after confirm",
  );

  console.log("\n8) Ticket reopen...\n");
  const reopen = await apiRequest(`/api/ticket/${ticketId}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "reopen", comment: "E2E reopen path" }),
  });
  pretty("ticket-reopen", reopen);
  assert(reopen.status === 200, "Ticket reopen should return 200");
  assert(
    reopen.json?.ticket?.status === "reopened",
    "Ticket should be reopened after reopen action",
  );

  console.log("\nE2E API test suite completed successfully.");
}

main().catch((error) => {
  console.error("\nE2E API test suite failed:");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});

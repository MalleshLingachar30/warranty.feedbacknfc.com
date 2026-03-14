#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const WARRANTY_SESSION_COOKIE_NAME = "warranty_session";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchStatus(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, options);
  const body = await response.text();
  return {
    url,
    status: response.status,
    bodyLength: body.length,
  };
}

async function waitForScanEvent(prisma, stickerNumber, minimumCount, timeoutMs = 2500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = await prisma.stickerScanEvent.count({
      where: { stickerNumber },
    });

    if (count >= minimumCount) {
      return count;
    }

    await sleep(200);
  }

  const finalCount = await prisma.stickerScanEvent.count({
    where: { stickerNumber },
  });

  throw new Error(
    `Expected at least ${minimumCount} scan events for sticker ${stickerNumber}, found ${finalCount}.`,
  );
}

async function issueVerifiedOwnerSession(prisma, productId, phone) {
  const normalizedPhone = phone.startsWith("+")
    ? phone.replace(/[^\d+]/g, "")
    : `+${phone.replace(/\D/g, "")}`;
  const sessionToken = crypto.randomUUID();

  await prisma.otpSession.create({
    data: {
      phone: normalizedPhone,
      productId,
      purpose: "activation",
      otpCode: "123456",
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      verified: true,
      sessionToken,
      sessionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return {
    normalizedPhone,
    cookieHeader: `${WARRANTY_SESSION_COOKIE_NAME}=${sessionToken}`,
  };
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

  const prisma = new PrismaClient();

  try {
  console.log("\n3) Chat API validation...");
  const emptyChat = await apiRequest("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  pretty("chat-empty-messages", emptyChat);
  assert(emptyChat.status === 400, "Empty chat payload should return 400");
  assert(
    emptyChat.json?.error === "Messages required",
    "Expected 'Messages required' for empty chat payload",
  );

  console.log("\n4) Chat lead validation...");
  const invalidLead = await apiRequest("/api/chat/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "E2E Invalid Lead",
      email: "not-an-email",
      phone: "123",
      company: "Invalid Corp",
      country: "India",
      language: "English",
      userType: "Manufacturer",
    }),
  });
  pretty("chat-lead-invalid", invalidLead);
  assert(invalidLead.status === 400, "Invalid lead payload should return 400");
  assert(
    invalidLead.json?.error === "Invalid email",
    "Expected invalid email validation message",
  );

  console.log("\n5) Chat lead creation...");
  const leadEmail = `e2e-chat-${Date.now()}@example.com`;
  const createLead = await apiRequest("/api/chat/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "E2E Chat Lead",
      email: leadEmail,
      phone: "+1 (555) 123-4567",
      company: "E2E Warranty Co",
      country: "India",
      language: "English",
      userType: "Manufacturer",
    }),
  });
  pretty("chat-lead-create", createLead);
  assert(createLead.status === 200, "Lead capture should return 200");
  assert(
    createLead.json?.success === true && typeof createLead.json?.sessionId === "string",
    "Lead capture should return success with a sessionId",
  );

  const leadRecord = await prisma.chatLead.findUnique({
    where: { sessionId: createLead.json.sessionId },
    select: {
      name: true,
      email: true,
      company: true,
      language: true,
      userType: true,
    },
  });
  assert(leadRecord, "Expected persisted chat lead record");
  assert(leadRecord.email === leadEmail, "Persisted chat lead email mismatch");

  if (process.env.ANTHROPIC_API_KEY) {
    console.log("\n6) Chat AI response smoke test...");
    const chatSmoke = await apiRequest("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "How does the QR warranty system work?",
          },
        ],
      }),
    });
    pretty("chat-ai-smoke", chatSmoke);
    assert(chatSmoke.status === 200, "Chat AI smoke test should return 200");
    assert(
      typeof chatSmoke.json?.reply === "string" && chatSmoke.json.reply.length > 0,
      "Chat AI smoke test should return a non-empty reply",
    );
  } else {
    console.log(
      "\n6) Skipping chat AI response smoke test (ANTHROPIC_API_KEY not configured).",
    );
  }

  console.log("\n7) Sticker lookup (pre-ticket)...");
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

  console.log("\n8) NFC landing page (scan attribution)...");
  const scanCountBefore = await prisma.stickerScanEvent.count({
    where: { stickerNumber: seed.stickerNumber },
  });

  const nfcLanding = await fetchStatus(
    `/nfc/${seed.stickerNumber}?src=qr&lang=en`,
  );
  console.log(
    `\n[nfc-landing] ${nfcLanding.url}\nstatus: ${nfcLanding.status}\nbytes: ${nfcLanding.bodyLength}`,
  );
  assert(nfcLanding.status === 200, "NFC landing page should return 200");

  const scanCountAfter = await waitForScanEvent(
    prisma,
    seed.stickerNumber,
    scanCountBefore + 1,
  );
  console.log(
    `scan events: before=${scanCountBefore} after=${scanCountAfter}`,
  );

  const latestScan = await prisma.stickerScanEvent.findFirst({
    where: { stickerNumber: seed.stickerNumber },
    orderBy: { scannedAt: "desc" },
    select: {
      source: true,
      scannedAt: true,
    },
  });
  assert(latestScan, "Expected scan event to exist");
  assert(latestScan.source === "qr", "Expected scan source to be 'qr'");

  console.log("\n9) Warranty activation...");
  const activationSession = await issueVerifiedOwnerSession(
    prisma,
    seed.productId,
    "+1 (555) 123-1234",
  );
  const activate = await apiRequest("/api/warranty/activate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: activationSession.cookieHeader,
    },
    body: JSON.stringify({
      productId: seed.productId,
      customerName: "E2E Customer",
      customerPhone: activationSession.normalizedPhone,
      customerEmail: "e2e.customer@example.com",
      customerAddress: "221B API Street",
      installationDate: "2026-03-04",
      activationSource: "qr",
    }),
  });
  pretty("warranty-activation", activate);
  assert(activate.status === 200, "Warranty activation should return 200");
  assert(
    activate.json?.success === true,
    "Warranty activation success should be true",
  );

  const activatedProduct = await prisma.product.findUnique({
    where: { id: seed.productId },
    select: { metadata: true },
  });
  assert(activatedProduct, "Activated product should exist");
  assert(
    activatedProduct.metadata?.activationSource === "qr",
    "Expected product.metadata.activationSource to be 'qr'",
  );

  console.log("\n10) Ticket creation...");
  const createTicket = await apiRequest("/api/ticket/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: activationSession.cookieHeader,
    },
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
    "\n11) Sticker lookup (post-ticket) should include open ticket...",
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

  console.log(
    "\n12) Forcing ticket status to pending_confirmation (E2E harness)...",
  );
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: "pending_confirmation" },
  });

  console.log("\n13) Ticket confirm...\n");
  const confirm = await apiRequest(`/api/ticket/${ticketId}/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: activationSession.cookieHeader,
    },
    body: JSON.stringify({ action: "confirm", comment: "E2E confirm path" }),
  });
  pretty("ticket-confirm", confirm);
  assert(confirm.status === 200, "Ticket confirm should return 200");
  assert(
    confirm.json?.ticket?.status === "resolved",
    "Ticket should be resolved after confirm",
  );

  console.log("\n14) Ticket reopen...\n");
  const reopen = await apiRequest(`/api/ticket/${ticketId}/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: activationSession.cookieHeader,
    },
    body: JSON.stringify({ action: "reopen", comment: "E2E reopen path" }),
  });
  pretty("ticket-reopen", reopen);
  assert(reopen.status === 200, "Ticket reopen should return 200");
  assert(
    reopen.json?.ticket?.status === "reopened",
    "Ticket should be reopened after reopen action",
  );

  console.log("\nE2E API test suite completed successfully.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nE2E API test suite failed:");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { runPmNotificationDryRun } from "../src/lib/preventive-maintenance-notification-dry-run-client.ts";

const dispatchResult = {
  dryRun: true,
  preparedAt: "2026-08-05T12:00:00.000Z",
  scannedIntentCount: 3,
  candidateAttemptCount: 6,
  createdAttemptCount: 2,
  existingAttemptCount: 4,
  missingRecipientCount: 0,
  queuedAttemptCount: 0,
  skippedAttemptCount: 6,
  preferenceSuppressedCount: 0,
  suppressionReasonCounts: { dry_run: 6 },
};

let capturedUrl = null;
let capturedInit = null;
const result = await runPmNotificationDryRun({
  triggerType: "scheduled",
  fetchImpl: async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return Response.json(dispatchResult);
  },
});

assert.equal(capturedUrl, "/api/preventive-maintenance/notifications/dispatch");
assert.equal(capturedInit?.method, "POST");
assert.equal(capturedInit?.headers?.["Content-Type"], "application/json");
assert.deepEqual(JSON.parse(capturedInit?.body), {
  dryRun: true,
  channels: ["email", "sms"],
  limit: 50,
  triggerType: "scheduled",
});
assert.deepEqual(result, dispatchResult);

await assert.rejects(
  () =>
    runPmNotificationDryRun({
      fetchImpl: async () =>
        Response.json({ error: "Dry run blocked." }, { status: 403 }),
    }),
  /Dry run blocked\./,
);
await assert.rejects(
  () =>
    runPmNotificationDryRun({
      fetchImpl: async () =>
        Response.json({ ...dispatchResult, dryRun: false }),
    }),
  /did not confirm dry-run mode/,
);

const [marketingPage, globalCss, dashboardShell, reportingDashboard] =
  await Promise.all([
    readFile("src/app/(marketing)/page.tsx", "utf8"),
    readFile("src/app/globals.css", "utf8"),
    readFile("src/components/layout/dashboard-shell.tsx", "utf8"),
    readFile(
      "src/components/notifications/pm-notification-reporting-dashboard.tsx",
      "utf8",
    ),
  ]);

assert.doesNotMatch(marketingPage, /cdn\.tailwindcss\.com/);
assert.match(globalCss, /@import "tailwindcss";/);
assert.match(dashboardShell, /flex min-w-0 flex-1 flex-col/);
assert.match(dashboardShell, /min-w-0 max-w-full flex-1/);
assert.match(reportingDashboard, /min-w-0 max-w-full/);
assert.match(reportingDashboard, /<Card className="min-w-0">/);

console.log(
  JSON.stringify(
    {
      status: "passed",
      checks: {
        dryRunPostContract: true,
        dryRunResponseGuard: true,
        compiledTailwind: true,
        mobileOverflowContainment: true,
      },
    },
    null,
    2,
  ),
);

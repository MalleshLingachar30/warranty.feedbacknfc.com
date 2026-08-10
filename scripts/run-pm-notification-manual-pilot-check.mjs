import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolvePreventiveMaintenanceEmailDeliveryReadiness } from "../src/lib/preventive-maintenance-email-readiness.ts";
import {
  PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP,
  PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
  resolvePreventiveMaintenanceManualEmailPilotRequest,
} from "../src/lib/preventive-maintenance-manual-email-pilot-policy.ts";
import { resolvePreventiveMaintenanceScheduledDispatcherMode } from "../src/lib/preventive-maintenance-scheduled-dispatch-policy.ts";

const notificationIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
];

assert.equal(PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP, 5);
assert.equal(
  resolvePreventiveMaintenanceManualEmailPilotRequest({
    notificationIds,
    confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
  }).ok,
  true,
);

for (const invalidRequest of [
  { notificationIds },
  {
    notificationIds: [
      ...notificationIds,
      "00000000-0000-4000-8000-000000000006",
    ],
    confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
  },
  {
    notificationIds: [notificationIds[0], notificationIds[0]],
    confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
  },
  {
    notificationIds: [notificationIds[0]],
    confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
    scheduledRunId: "scheduler-call",
  },
  {
    notificationIds: [notificationIds[0]],
    confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
    channels: ["sms"],
  },
]) {
  assert.equal(
    resolvePreventiveMaintenanceManualEmailPilotRequest(invalidRequest).ok,
    false,
  );
}

const maskRecipient = () => "m***@e***.com";
const disabledReadiness = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {},
  maskRecipient,
);
assert.equal(disabledReadiness.liveEmail.status, "disabled");

const incompleteReadiness = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  { PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED: "true" },
  maskRecipient,
);
assert.equal(incompleteReadiness.liveEmail.status, "incomplete");

const readyReadiness = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {
    PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED: "true",
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "Warranty <notifications@example.com>",
  },
  maskRecipient,
);
assert.equal(readyReadiness.liveEmail.status, "ready");
assert.equal(readyReadiness.sms.status, "unsupported");

const schedulerDefault = resolvePreventiveMaintenanceScheduledDispatcherMode({
  schedulerEnabled: false,
  liveDeliveryRequested: true,
  liveEmailStatus: "ready",
  liveEmailMissingConfiguration: [],
});
assert.equal(schedulerDefault.enabled, false);
assert.equal(schedulerDefault.dryRun, true);
assert.equal(schedulerDefault.mode, "disabled");

const [
  dispatchSource,
  routeSource,
  clientSource,
  reportingSource,
  uiSource,
  schedulerSource,
] = await Promise.all([
  readFile("src/lib/preventive-maintenance-notification-dispatch.ts", "utf8"),
  readFile(
    "src/app/api/preventive-maintenance/notifications/manual-email-pilot/route.ts",
    "utf8",
  ),
  readFile(
    "src/lib/preventive-maintenance-manual-email-pilot-client.ts",
    "utf8",
  ),
  readFile("src/lib/preventive-maintenance-notification-reporting.ts", "utf8"),
  readFile(
    "src/components/notifications/pm-notification-manual-email-pilot-panel.tsx",
    "utf8",
  ),
  readFile("src/lib/preventive-maintenance-scheduled-dispatcher.ts", "utf8"),
]);

assert.match(dispatchSource, /operation: "manual_live_email_pilot"/);
assert.match(dispatchSource, /executionContext: \{ source: "manual_pilot" \}/);
assert.match(
  dispatchSource,
  /Generic PM notification dispatch is dry-run only/,
);
assert.match(dispatchSource, /getPreventiveMaintenanceEmailDeliveryReadiness/);
assert.doesNotMatch(routeSource, /scheduledRunId|channels|sms/i);
assert.match(
  clientSource,
  /\/api\/preventive-maintenance\/notifications\/manual-email-pilot/,
);
assert.match(clientSource, /notificationIds: input\.notificationIds/);
assert.match(
  clientSource,
  /PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION/,
);
assert.doesNotMatch(clientSource, /providerResponse/);
assert.match(reportingSource, /manualPilot:/);
assert.match(reportingSource, /dispatchSource/);
assert.match(uiSource, /confirm a live Resend email\s+pilot now/);
assert.match(uiSource, /cannot send\s+SMS/);
assert.match(
  schedulerSource,
  /PM_NOTIFICATION_SCHEDULED_DISPATCH_ENABLED === "true"/,
);
assert.match(
  schedulerSource,
  /PM_NOTIFICATION_SCHEDULED_LIVE_DELIVERY_ENABLED === "true"/,
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      checks: {
        explicitConfirmation: true,
        hardBatchCap: true,
        ambiguousAndSchedulerRequestsRejected: true,
        smsUnsupported: true,
        liveEmailGateAndReadiness: true,
        schedulerDefaultsUnchanged: true,
        privacySafeResponse: true,
        auditAndReportingVisibility: true,
        successfulClientContract: true,
      },
    },
    null,
    2,
  ),
);

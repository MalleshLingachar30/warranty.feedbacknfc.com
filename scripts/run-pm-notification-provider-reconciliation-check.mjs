import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { serializePreventiveMaintenanceDeliveryAttemptForView } from "../src/lib/preventive-maintenance-delivery-attempts.ts";
import {
  countProviderEventStatuses,
  hygieneStatusForProviderEvent,
  mapResendProviderEventStatus,
  parsePreventiveMaintenanceProviderReconciliationRequest,
  recipientHygieneBlockReason,
  shouldApplyPreventiveMaintenanceProviderEvent,
} from "../src/lib/preventive-maintenance-provider-reconciliation-policy.ts";
import {
  hashPreventiveMaintenanceRecipientAddress,
  normalizePreventiveMaintenanceRecipientAddress,
} from "../src/lib/preventive-maintenance-recipient-hygiene.ts";

const expectedPhase5cCounts = {
  delivered: 7,
  bounced: 1,
  sent: 1,
  suppressed: 4,
  delivery_delayed: 2,
};
const evidence = JSON.parse(
  await readFile(
    "scripts/fixtures/pm-phase5c-resend-provider-status-sanitized.json",
    "utf8",
  ),
);

const parsedEvidence =
  parsePreventiveMaintenanceProviderReconciliationRequest(evidence);
assert.equal(parsedEvidence.length, 15);
const evidenceCounts = countProviderEventStatuses(
  parsedEvidence.map((event) => ({ providerEventStatus: event.status })),
);
for (const [status, count] of Object.entries(expectedPhase5cCounts)) {
  assert.equal(evidenceCounts[status], count);
}

for (const [providerValue, canonical] of [
  ["email.sent", "sent"],
  ["email.delivered", "delivered"],
  ["email.bounced", "bounced"],
  ["email.suppressed", "suppressed"],
  ["email.delivery_delayed", "delivery_delayed"],
  ["email.complained", "complained"],
  ["email.failed", "failed"],
  ["future.event", "unknown"],
]) {
  assert.equal(mapResendProviderEventStatus(providerValue), canonical);
}

assert.equal(hygieneStatusForProviderEvent("bounced"), "bounced");
assert.equal(hygieneStatusForProviderEvent("suppressed"), "suppressed");
assert.equal(hygieneStatusForProviderEvent("complained"), "complained");
assert.equal(hygieneStatusForProviderEvent("delivered"), null);
assert.equal(
  recipientHygieneBlockReason("suppressed"),
  "recipient_hygiene_blocked_suppressed",
);
assert.equal(
  normalizePreventiveMaintenanceRecipientAddress(
    " Pilot.Recipient@Example.COM ",
    "email",
  ),
  "pilot.recipient@example.com",
);
assert.equal(
  hashPreventiveMaintenanceRecipientAddress(
    "Pilot.Recipient@Example.COM",
    "email",
  ),
  hashPreventiveMaintenanceRecipientAddress(
    "pilot.recipient@example.com",
    "email",
  ),
);

assert.equal(
  shouldApplyPreventiveMaintenanceProviderEvent({
    currentStatus: "delivery_delayed",
    currentOccurredAt: new Date("2026-08-11T04:46:00.000Z"),
    nextStatus: "delivered",
    nextOccurredAt: new Date("2026-08-11T04:47:00.000Z"),
  }),
  true,
);
assert.equal(
  shouldApplyPreventiveMaintenanceProviderEvent({
    currentStatus: "delivered",
    currentOccurredAt: new Date("2026-08-11T04:47:00.000Z"),
    nextStatus: "sent",
    nextOccurredAt: new Date("2026-08-11T04:46:00.000Z"),
  }),
  false,
);
assert.equal(
  shouldApplyPreventiveMaintenanceProviderEvent({
    currentStatus: "delivered",
    currentOccurredAt: new Date("2026-08-11T04:47:00.000Z"),
    nextStatus: "delivered",
    nextOccurredAt: new Date("2026-08-11T04:47:00.000Z"),
  }),
  false,
);

const rawRecipient = "private.recipient@example.com";
const serializedAttempt = serializePreventiveMaintenanceDeliveryAttemptForView({
  id: "attempt-1",
  channel: "email",
  status: "sent",
  dryRun: false,
  recipientAddress: rawRecipient,
  providerMessageId: "provider-message-1",
  providerEventStatus: "bounced",
  providerEventAt: new Date("2026-08-11T04:46:00.000Z"),
  providerReconciledAt: new Date("2026-08-11T05:00:00.000Z"),
  errorMessage: `provider rejected ${rawRecipient}`,
  skipReason: null,
  attemptNumber: 1,
  nextRetryAt: null,
  deadLetteredAt: null,
  createdAt: new Date("2026-08-11T04:45:00.000Z"),
  updatedAt: new Date("2026-08-11T05:00:00.000Z"),
});
assert.equal(serializedAttempt.providerEventStatus, "bounced");
assert.equal(serializedAttempt.recipientHygieneRisk, true);
assert.equal(JSON.stringify(serializedAttempt).includes(rawRecipient), false);
assert.equal("providerResponse" in serializedAttempt, false);

const [
  dispatchSource,
  schedulerSource,
  preferencePolicySource,
  reconciliationSource,
  routeSource,
] = await Promise.all([
  readFile("src/lib/preventive-maintenance-notification-dispatch.ts", "utf8"),
  readFile("src/lib/preventive-maintenance-scheduled-dispatcher.ts", "utf8"),
  readFile(
    "src/lib/preventive-maintenance-notification-preference-policy.ts",
    "utf8",
  ),
  readFile("src/lib/preventive-maintenance-provider-reconciliation.ts", "utf8"),
  readFile(
    "src/app/api/preventive-maintenance/notifications/provider-reconciliation/route.ts",
    "utf8",
  ),
]);

assert.match(dispatchSource, /providerEventStatus: "accepted"/);
assert.match(dispatchSource, /getBlockedPreventiveMaintenanceRecipients/);
assert.match(preferencePolicySource, /recipientHygieneBlockReason/);
assert.match(preferencePolicySource, /sms_delivery_unsupported/);
assert.match(
  reconciliationSource,
  /audience\.organizationId[\s\S]*organizationId: audience\.organizationId/,
);
assert.match(
  reconciliationSource,
  /notificationIntent: \{ is: audience\.where \}/,
);
assert.match(
  schedulerSource,
  /PM_NOTIFICATION_SCHEDULED_LIVE_DELIVERY_ENABLED === "true"/,
);
assert.doesNotMatch(
  schedulerSource,
  /SCHEDULED_LIVE_DELIVERY_ENABLED !== "false"/,
);
assert.doesNotMatch(routeSource, /recipientAddress|providerResponse/);

console.log(
  JSON.stringify(
    {
      status: "passed",
      checks: {
        phase5cEvidenceMapping: true,
        providerLifecycleMapping: true,
        staleEventProtection: true,
        recipientHygieneSignals: true,
        rawRecipientSerializationBlocked: true,
        reportingSourceOfTruth: true,
        schedulerLiveDefaultUnchanged: true,
        smsUnsupported: true,
        authenticatedPrivacySafeRoute: true,
      },
    },
    null,
    2,
  ),
);

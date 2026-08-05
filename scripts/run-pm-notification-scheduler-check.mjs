#!/usr/bin/env node

import { strict as assert } from "node:assert";

import { serializePreventiveMaintenanceDeliveryAttemptForView } from "../src/lib/preventive-maintenance-delivery-attempts.ts";
import {
  getPreventiveMaintenanceNotificationRolePreference,
  resolvePreventiveMaintenanceNotificationRolePreferences,
  resolvePreventiveMaintenanceNotificationSuppression,
} from "../src/lib/preventive-maintenance-notification-preference-policy.ts";
import {
  buildPreventiveMaintenanceScheduledRunKey,
  getPreventiveMaintenanceNextRetryAt,
  resolvePreventiveMaintenanceScheduledAttemptAction,
  resolvePreventiveMaintenanceScheduledDispatcherMode,
} from "../src/lib/preventive-maintenance-scheduled-dispatch-policy.ts";

const disabledByDefault = resolvePreventiveMaintenanceScheduledDispatcherMode({
  schedulerEnabled: false,
  liveDeliveryRequested: false,
  liveEmailStatus: "disabled",
  liveEmailMissingConfiguration: [],
});
assert.equal(disabledByDefault.mode, "disabled");
assert.equal(disabledByDefault.dryRun, true);

const enabledDryRun = resolvePreventiveMaintenanceScheduledDispatcherMode({
  schedulerEnabled: true,
  liveDeliveryRequested: false,
  liveEmailStatus: "ready",
  liveEmailMissingConfiguration: [],
});
assert.equal(enabledDryRun.mode, "dry_run");
assert.equal(enabledDryRun.dryRun, true);

const liveRequestBlockedByHardGate =
  resolvePreventiveMaintenanceScheduledDispatcherMode({
    schedulerEnabled: true,
    liveDeliveryRequested: true,
    liveEmailStatus: "disabled",
    liveEmailMissingConfiguration: [],
  });
assert.equal(liveRequestBlockedByHardGate.mode, "dry_run");
assert.deepEqual(liveRequestBlockedByHardGate.blockingReasons, [
  "PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED",
]);

const liveReady = resolvePreventiveMaintenanceScheduledDispatcherMode({
  schedulerEnabled: true,
  liveDeliveryRequested: true,
  liveEmailStatus: "ready",
  liveEmailMissingConfiguration: [],
});
assert.equal(liveReady.mode, "live");
assert.equal(liveReady.dryRun, false);

const firstWindow = new Date("2026-08-05T10:01:00.000Z");
const sameWindow = new Date("2026-08-05T10:14:59.999Z");
const nextWindow = new Date("2026-08-05T10:15:00.000Z");
assert.equal(
  buildPreventiveMaintenanceScheduledRunKey(firstWindow),
  buildPreventiveMaintenanceScheduledRunKey(sameWindow),
);
assert.notEqual(
  buildPreventiveMaintenanceScheduledRunKey(firstWindow),
  buildPreventiveMaintenanceScheduledRunKey(nextWindow),
);

const now = new Date("2026-08-05T10:00:00.000Z");
const activeClaim = resolvePreventiveMaintenanceScheduledAttemptAction({
  status: "sending",
  attemptNumber: 1,
  nextRetryAt: null,
  claimExpiresAt: new Date("2026-08-05T10:01:00.000Z"),
  now,
});
assert.equal(activeClaim.action, "ignore");

const legacyClaimWithoutExpiry =
  resolvePreventiveMaintenanceScheduledAttemptAction({
    status: "sending",
    attemptNumber: 1,
    nextRetryAt: null,
    claimExpiresAt: null,
    now,
  });
assert.equal(legacyClaimWithoutExpiry.action, "claim");

const expiredClaim = resolvePreventiveMaintenanceScheduledAttemptAction({
  status: "sending",
  attemptNumber: 2,
  nextRetryAt: null,
  claimExpiresAt: new Date("2026-08-05T09:59:00.000Z"),
  now,
});
assert.deepEqual(expiredClaim, {
  action: "claim",
  nextAttemptNumber: 2,
  retrying: true,
  reclaimingExpiredClaim: true,
});

const deferredRetry = resolvePreventiveMaintenanceScheduledAttemptAction({
  status: "failed",
  attemptNumber: 1,
  nextRetryAt: new Date("2026-08-05T10:15:00.000Z"),
  claimExpiresAt: null,
  now,
});
assert.equal(deferredRetry.action, "defer_retry");

const eligibleRetry = resolvePreventiveMaintenanceScheduledAttemptAction({
  status: "failed",
  attemptNumber: 1,
  nextRetryAt: new Date("2026-08-05T09:59:00.000Z"),
  claimExpiresAt: null,
  now,
});
assert.deepEqual(eligibleRetry, {
  action: "claim",
  nextAttemptNumber: 2,
  retrying: true,
  reclaimingExpiredClaim: false,
});

const retryLimitReached = resolvePreventiveMaintenanceScheduledAttemptAction({
  status: "failed",
  attemptNumber: 3,
  nextRetryAt: null,
  claimExpiresAt: null,
  now,
});
assert.equal(retryLimitReached.action, "dead_letter");

assert(
  getPreventiveMaintenanceNextRetryAt({
    now,
    failedAttemptNumber: 2,
  }) >
    getPreventiveMaintenanceNextRetryAt({
      now,
      failedAttemptNumber: 1,
    }),
);

const preferences = resolvePreventiveMaintenanceNotificationRolePreferences([
  {
    recipientRole: "service_center",
    emailEnabled: false,
    smsEnabled: false,
  },
]);
const serviceCenterPreference =
  getPreventiveMaintenanceNotificationRolePreference(
    preferences,
    "service_center",
  );
assert.equal(
  resolvePreventiveMaintenanceNotificationSuppression({
    recipientRole: "service_center",
    channel: "email",
    preference: serviceCenterPreference,
    recipientAvailable: true,
    recipientAddress: "service@example.com",
    dryRun: false,
    emailDeliverySkipReason: null,
  }),
  "service_center_email_disabled",
);
assert.equal(
  resolvePreventiveMaintenanceNotificationSuppression({
    recipientRole: "customer",
    channel: "email",
    preference: getPreventiveMaintenanceNotificationRolePreference(
      preferences,
      "customer",
    ),
    recipientAvailable: false,
    recipientAddress: "customer@example.com",
    dryRun: false,
    emailDeliverySkipReason: null,
  }),
  "customer_unavailable",
);
assert.equal(
  resolvePreventiveMaintenanceNotificationSuppression({
    recipientRole: "customer",
    channel: "sms",
    preference: {
      recipientRole: "customer",
      emailEnabled: true,
      smsEnabled: true,
      source: "organization_override",
      updatedAt: null,
    },
    recipientAvailable: true,
    recipientAddress: "+919999999999",
    dryRun: false,
    emailDeliverySkipReason: null,
  }),
  "sms_delivery_unsupported",
);

const rawRecipient = "customer@example.com";
const serializedAttempt = serializePreventiveMaintenanceDeliveryAttemptForView({
  id: "attempt-1",
  channel: "email",
  status: "failed",
  dryRun: false,
  recipientAddress: rawRecipient,
  providerMessageId: null,
  errorMessage: `Delivery to ${rawRecipient} was rejected.`,
  skipReason: null,
  attemptNumber: 1,
  nextRetryAt: null,
  deadLetteredAt: null,
  createdAt: now,
  updatedAt: now,
});
assert.equal(JSON.stringify(serializedAttempt).includes(rawRecipient), false);

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    scenarios: 16,
    defaultMode: disabledByDefault.mode,
    liveRequiresExistingEmailGate: true,
    overlappingClaimsSuppressed: true,
    maxAttempts: 3,
    liveSmsSupported: false,
    rawRecipientSerialized: false,
  })}\n`,
);

#!/usr/bin/env node

import { strict as assert } from "node:assert";

import { resolvePreventiveMaintenanceEmailDeliveryReadiness } from "../src/lib/preventive-maintenance-email-readiness.ts";

const maskRecipient = () => "i***@e***.com";

const defaults = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {},
  maskRecipient,
);
assert.equal(defaults.liveEmail.status, "disabled");
assert.equal(defaults.canary.status, "disabled");
assert.equal(defaults.sms.status, "unsupported");

const incompleteLive = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {
    PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED: "true",
  },
  maskRecipient,
);
assert.equal(incompleteLive.liveEmail.status, "incomplete");
assert.deepEqual(incompleteLive.liveEmail.missingConfiguration, [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
]);

const invalidCanary = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {
    PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED: "true",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "Warranty <notifications@example.com>",
    PM_NOTIFICATION_EMAIL_CANARY_ENABLED: "true",
    PM_NOTIFICATION_EMAIL_CANARY_RECIPIENT: "not-an-email",
  },
  maskRecipient,
);
assert.equal(invalidCanary.liveEmail.status, "ready");
assert.equal(invalidCanary.canary.status, "incomplete");
assert.equal(invalidCanary.canary.recipientAddressMasked, null);

const invalidSender = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {
    PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED: "true",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "not-an-email",
  },
  maskRecipient,
);
assert.equal(invalidSender.liveEmail.status, "incomplete");
assert.equal(invalidSender.liveEmail.fromEmailConfigured, false);

const rawRecipient = "internal-canary@example.com";
const ready = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {
    PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED: "true",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "Warranty <notifications@example.com>",
    PM_NOTIFICATION_EMAIL_CANARY_ENABLED: "true",
    PM_NOTIFICATION_EMAIL_CANARY_RECIPIENT: rawRecipient,
  },
  maskRecipient,
);
assert.equal(ready.liveEmail.status, "ready");
assert.equal(ready.canary.status, "ready");
assert.equal(ready.canary.recipientAddressMasked, "i***@e***.com");
assert.equal(JSON.stringify(ready).includes(rawRecipient), false);

const nonExactEnablement = resolvePreventiveMaintenanceEmailDeliveryReadiness(
  {
    PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED: "TRUE",
    PM_NOTIFICATION_EMAIL_CANARY_ENABLED: "TRUE",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "Warranty <notifications@example.com>",
    PM_NOTIFICATION_EMAIL_CANARY_RECIPIENT: rawRecipient,
  },
  maskRecipient,
);
assert.equal(nonExactEnablement.liveEmail.status, "disabled");
assert.equal(nonExactEnablement.canary.status, "disabled");

process.stdout.write(
  `${JSON.stringify({ ok: true, scenarios: 6, rawRecipientSerialized: false })}\n`,
);

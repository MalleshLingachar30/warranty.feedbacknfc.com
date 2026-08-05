#!/usr/bin/env node

import { strict as assert } from "node:assert";

import {
  getPreventiveMaintenanceNotificationRolePreference,
  isPreventiveMaintenanceMissingRecipientReason,
  isPreventiveMaintenancePreferenceSuppressionReason,
  resolvePreventiveMaintenanceNotificationRolePreferences,
  resolvePreventiveMaintenanceNotificationSuppression,
} from "../src/lib/preventive-maintenance-notification-preference-policy.ts";

const defaults = resolvePreventiveMaintenanceNotificationRolePreferences([]);
assert.equal(defaults.length, 4);
assert(defaults.every((preference) => preference.emailEnabled));
assert(defaults.every((preference) => !preference.smsEnabled));
assert(defaults.every((preference) => preference.source === "default"));

const rules = resolvePreventiveMaintenanceNotificationRolePreferences([
  {
    recipientRole: "service_center",
    emailEnabled: false,
    smsEnabled: true,
    updatedAt: "2026-08-05T08:00:00.000Z",
  },
]);
const serviceCenter = getPreventiveMaintenanceNotificationRolePreference(
  rules,
  "service_center",
);
assert.equal(serviceCenter.source, "organization_override");
assert.equal(serviceCenter.emailEnabled, false);
assert.equal(serviceCenter.smsEnabled, true);

function suppression(overrides) {
  const recipientRole = overrides.recipientRole ?? "customer";
  return resolvePreventiveMaintenanceNotificationSuppression({
    recipientRole,
    channel: overrides.channel ?? "email",
    preference:
      overrides.preference ??
      getPreventiveMaintenanceNotificationRolePreference(
        defaults,
        recipientRole,
      ),
    recipientAvailable: overrides.recipientAvailable ?? true,
    recipientAddress:
      "recipientAddress" in overrides
        ? overrides.recipientAddress
        : "recipient@example.com",
    dryRun: overrides.dryRun ?? false,
    emailDeliverySkipReason: overrides.emailDeliverySkipReason ?? null,
  });
}

assert.equal(
  suppression({ recipientRole: "customer", recipientAvailable: false }),
  "customer_unavailable",
);
assert.equal(
  suppression({ recipientRole: "technician", recipientAddress: null }),
  "technician_missing_email",
);
assert.equal(
  suppression({
    recipientRole: "technician",
    channel: "sms",
    recipientAddress: null,
  }),
  "technician_missing_phone",
);
assert.equal(
  suppression({
    recipientRole: "service_center",
    preference: serviceCenter,
  }),
  "service_center_email_disabled",
);
assert.equal(
  suppression({ emailDeliverySkipReason: "email_delivery_disabled" }),
  "email_delivery_disabled",
);
assert.equal(
  suppression({ emailDeliverySkipReason: "missing_resend_api_key" }),
  "missing_resend_api_key",
);
assert.equal(suppression({ channel: "sms" }), "customer_sms_disabled");
assert.equal(
  suppression({
    recipientRole: "service_center",
    channel: "sms",
    preference: serviceCenter,
  }),
  "sms_delivery_unsupported",
);
assert.equal(
  suppression({
    dryRun: true,
    emailDeliverySkipReason: "email_delivery_disabled",
  }),
  "dry_run",
);
assert.equal(
  isPreventiveMaintenancePreferenceSuppressionReason(
    "service_center_email_disabled",
  ),
  true,
);
assert.equal(
  isPreventiveMaintenanceMissingRecipientReason("customer_unavailable"),
  true,
);
assert.equal(
  isPreventiveMaintenanceMissingRecipientReason("technician_missing_email"),
  true,
);

process.stdout.write(
  `${JSON.stringify({ ok: true, scenarios: 12, liveSmsSupported: false })}\n`,
);

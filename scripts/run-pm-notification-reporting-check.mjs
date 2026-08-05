import assert from "node:assert/strict";

import {
  buildPmNotificationComplianceCsv,
  countPmNotificationAttemptStatuses,
  durationMinutes,
  isPmNotificationReportingGlobalScope,
  parsePmNotificationReportingFilters,
  sanitizePmNotificationReportingDiagnostic,
  summarizePmNotificationDurations,
} from "../src/lib/preventive-maintenance-notification-reporting-policy.ts";

const fixedNow = new Date("2026-08-05T12:00:00.000Z");
const defaultFilters = parsePmNotificationReportingFilters(
  new URLSearchParams(),
  fixedNow,
);
assert.equal(defaultFilters.startDate, "2026-07-07");
assert.equal(defaultFilters.endDate, "2026-08-05");
assert.equal(defaultFilters.status, "all");
assert.equal(defaultFilters.channel, "all");

const filtered = parsePmNotificationReportingFilters(
  new URLSearchParams({
    startDate: "2026-08-01",
    endDate: "2026-08-05",
    status: "dismissed",
    channel: "email",
  }),
  fixedNow,
);
assert.equal(filtered.status, "dismissed");
assert.equal(filtered.channel, "email");
assert.equal(filtered.startAt.toISOString(), "2026-08-01T00:00:00.000Z");
assert.equal(filtered.endAtExclusive.toISOString(), "2026-08-06T00:00:00.000Z");
assert.throws(() =>
  parsePmNotificationReportingFilters(
    new URLSearchParams({
      startDate: "2026-08-06",
      endDate: "2026-08-05",
    }),
    fixedNow,
  ),
);

assert.equal(
  durationMinutes(
    new Date("2026-08-05T10:00:00.000Z"),
    new Date("2026-08-05T11:30:00.000Z"),
  ),
  90,
);
assert.equal(
  durationMinutes(
    new Date("2026-08-05T11:30:00.000Z"),
    new Date("2026-08-05T10:00:00.000Z"),
  ),
  null,
);
assert.deepEqual(summarizePmNotificationDurations([]), {
  sampleCount: 0,
  averageMinutes: null,
  medianMinutes: null,
  p90Minutes: null,
});
assert.deepEqual(summarizePmNotificationDurations([10, 20, null, 30, 40]), {
  sampleCount: 4,
  averageMinutes: 25,
  medianMinutes: 25,
  p90Minutes: 40,
});

const attemptCounts = countPmNotificationAttemptStatuses([
  { channel: "email", status: "queued" },
  { channel: "email", status: "sent" },
  { channel: "email", status: "sent" },
  { channel: "sms", status: "skipped" },
  { channel: "sms", status: "dead_letter" },
]);
assert.equal(attemptCounts.email.queued, 1);
assert.equal(attemptCounts.email.sent, 2);
assert.equal(attemptCounts.sms.skipped, 1);
assert.equal(attemptCounts.sms.dead_letter, 1);
assert.equal(attemptCounts.sms.sent, 0);

assert.equal(isPmNotificationReportingGlobalScope("platform_owner"), true);
assert.equal(isPmNotificationReportingGlobalScope("manufacturer_admin"), false);
assert.equal(
  isPmNotificationReportingGlobalScope("service_center_admin"),
  false,
);
assert.equal(
  sanitizePmNotificationReportingDiagnostic(
    "delivery skipped for private.recipient@example.com at +91 98765 43210",
  ),
  "delivery skipped for [redacted email] at [redacted phone]",
);

const emptyCsv = buildPmNotificationComplianceCsv([]);
assert.equal(emptyCsv.split("\r\n").length, 1);
assert.match(emptyCsv, /^notification_id,event_number,/);

const rawRecipientFixture = "private.recipient@example.com";
const csv = buildPmNotificationComplianceCsv([
  {
    notificationId: "notification-1",
    eventNumber: 'PM-000001, "calibration"',
    triggerType: "scheduled",
    recipientRole: "technician",
    notificationStatus: "dismissed",
    notificationCreatedAt: "2026-08-05T10:00:00.000Z",
    dismissedAt: "2026-08-05T10:15:00.000Z",
    dismissalMinutes: 15,
    nextPmStatusChange: "started",
    nextPmStatusChangedAt: "2026-08-05T10:30:00.000Z",
    pmStatusChangeMinutes: 30,
    emailQueued: 0,
    emailSending: 0,
    emailSkipped: 0,
    emailFailed: 0,
    emailSent: 1,
    emailDeadLetter: 0,
    smsQueued: 0,
    smsSending: 0,
    smsSkipped: 1,
    smsFailed: 0,
    smsSent: 0,
    smsDeadLetter: 0,
  },
]);
assert.match(csv, /"PM-000001, ""calibration"""/);
assert.doesNotMatch(csv, /recipient_address|phone|provider_response/i);
assert.equal(csv.includes(rawRecipientFixture), false);

console.log(
  JSON.stringify(
    {
      status: "passed",
      checks: {
        filters: true,
        metricAggregation: true,
        responsiveness: true,
        organizationScopePolicy: true,
        exportMasking: true,
        emptyStates: true,
      },
    },
    null,
    2,
  ),
);

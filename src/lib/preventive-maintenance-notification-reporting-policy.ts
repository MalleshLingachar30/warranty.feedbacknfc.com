import type {
  PreventiveMaintenanceNotificationDeliveryChannel,
  PreventiveMaintenanceNotificationDeliveryStatus,
  PreventiveMaintenanceNotificationStatus,
} from "@prisma/client";

export const PM_NOTIFICATION_REPORTING_STATUSES = [
  "all",
  "pending",
  "delivered",
  "dismissed",
  "cancelled",
] as const;

export const PM_NOTIFICATION_REPORTING_CHANNELS = [
  "all",
  "email",
  "sms",
] as const;

export type PmNotificationReportingStatus =
  (typeof PM_NOTIFICATION_REPORTING_STATUSES)[number];
export type PmNotificationReportingChannel =
  (typeof PM_NOTIFICATION_REPORTING_CHANNELS)[number];

export type PmNotificationReportingFilters = {
  startDate: string;
  endDate: string;
  startAt: Date;
  endAtExclusive: Date;
  status: PmNotificationReportingStatus;
  channel: PmNotificationReportingChannel;
};

export type PmNotificationDurationSummary = {
  sampleCount: number;
  averageMinutes: number | null;
  medianMinutes: number | null;
  p90Minutes: number | null;
};

export type PmNotificationReportCsvRow = {
  notificationId: string;
  eventNumber: string;
  triggerType: string;
  recipientRole: string;
  notificationStatus: string;
  notificationCreatedAt: string;
  dismissedAt: string | null;
  dismissalMinutes: number | null;
  nextPmStatusChange: string | null;
  nextPmStatusChangedAt: string | null;
  pmStatusChangeMinutes: number | null;
  emailQueued: number;
  emailSending: number;
  emailSkipped: number;
  emailFailed: number;
  emailSent: number;
  emailDeadLetter: number;
  smsQueued: number;
  smsSending: number;
  smsSkipped: number;
  smsFailed: number;
  smsSent: number;
  smsDeadLetter: number;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_REPORTING_DAYS = 366;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const PHONE_ADDRESS_PATTERN = /\+?\d(?:[\s().-]*\d){6,}/gu;

export class PmNotificationReportingFilterError extends Error {}

function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseUtcDate(value: string | null, fieldName: string) {
  if (!value || !DATE_PATTERN.test(value)) {
    throw new PmNotificationReportingFilterError(
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || utcDateString(date) !== value) {
    throw new PmNotificationReportingFilterError(
      `${fieldName} is not a valid calendar date.`,
    );
  }

  return date;
}

function enumValue<T extends readonly string[]>(
  values: T,
  value: string | null,
  fallback: T[number],
) {
  return values.includes(value as T[number]) ? (value as T[number]) : fallback;
}

export function parsePmNotificationReportingFilters(
  searchParams: URLSearchParams,
  now = new Date(),
): PmNotificationReportingFilters {
  const defaultEndAtExclusive = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const defaultStartAt = new Date(
    defaultEndAtExclusive.getTime() - 30 * DAY_MS,
  );

  const startAt = searchParams.has("startDate")
    ? parseUtcDate(searchParams.get("startDate"), "startDate")
    : defaultStartAt;
  const endDate = searchParams.has("endDate")
    ? parseUtcDate(searchParams.get("endDate"), "endDate")
    : new Date(defaultEndAtExclusive.getTime() - DAY_MS);
  const endAtExclusive = new Date(endDate.getTime() + DAY_MS);

  if (startAt >= endAtExclusive) {
    throw new PmNotificationReportingFilterError(
      "startDate must be on or before endDate.",
    );
  }

  if (
    endAtExclusive.getTime() - startAt.getTime() >
    MAX_REPORTING_DAYS * DAY_MS
  ) {
    throw new PmNotificationReportingFilterError(
      `Date range cannot exceed ${MAX_REPORTING_DAYS} days.`,
    );
  }

  return {
    startDate: utcDateString(startAt),
    endDate: utcDateString(endDate),
    startAt,
    endAtExclusive,
    status: enumValue(
      PM_NOTIFICATION_REPORTING_STATUSES,
      searchParams.get("status"),
      "all",
    ),
    channel: enumValue(
      PM_NOTIFICATION_REPORTING_CHANNELS,
      searchParams.get("channel"),
      "all",
    ),
  };
}

export function serializePmNotificationReportingFilters(
  filters: PmNotificationReportingFilters,
) {
  const params = new URLSearchParams({
    startDate: filters.startDate,
    endDate: filters.endDate,
    status: filters.status,
    channel: filters.channel,
  });

  return params.toString();
}

export function durationMinutes(start: Date, end: Date | null) {
  if (!end || end < start) {
    return null;
  }

  return Math.round(((end.getTime() - start.getTime()) / 60_000) * 10) / 10;
}

export function summarizePmNotificationDurations(
  durationsInMinutes: Array<number | null>,
): PmNotificationDurationSummary {
  const values = durationsInMinutes
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )
    .toSorted((left, right) => left - right);

  if (values.length === 0) {
    return {
      sampleCount: 0,
      averageMinutes: null,
      medianMinutes: null,
      p90Minutes: null,
    };
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const midpoint = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0
      ? (values[midpoint - 1] + values[midpoint]) / 2
      : values[midpoint];
  const p90Index = Math.max(0, Math.ceil(values.length * 0.9) - 1);

  return {
    sampleCount: values.length,
    averageMinutes: Math.round(average * 10) / 10,
    medianMinutes: Math.round(median * 10) / 10,
    p90Minutes: values[p90Index],
  };
}

export function emptyAttemptStatusCounts(): Record<
  PreventiveMaintenanceNotificationDeliveryStatus,
  number
> {
  return {
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    dead_letter: 0,
    skipped: 0,
  };
}

export function emptyNotificationStatusCounts(): Record<
  PreventiveMaintenanceNotificationStatus,
  number
> {
  return {
    pending: 0,
    delivered: 0,
    dismissed: 0,
    cancelled: 0,
  };
}

export function emptyChannelStatusCounts(): Record<
  PreventiveMaintenanceNotificationDeliveryChannel,
  Record<PreventiveMaintenanceNotificationDeliveryStatus, number>
> {
  return {
    email: emptyAttemptStatusCounts(),
    sms: emptyAttemptStatusCounts(),
  };
}

export function countPmNotificationAttemptStatuses(
  attempts: Array<{
    channel: PreventiveMaintenanceNotificationDeliveryChannel;
    status: PreventiveMaintenanceNotificationDeliveryStatus;
  }>,
) {
  const counts = emptyChannelStatusCounts();

  for (const attempt of attempts) {
    counts[attempt.channel][attempt.status] += 1;
  }

  return counts;
}

export function isPmNotificationReportingGlobalScope(role: string) {
  return role === "platform_owner";
}

export function sanitizePmNotificationReportingDiagnostic(
  value: string | null,
) {
  return (
    value
      ?.replace(EMAIL_ADDRESS_PATTERN, "[redacted email]")
      .replace(PHONE_ADDRESS_PATTERN, "[redacted phone]") ?? null
  );
}

function csvCell(value: string | number | null) {
  if (value === null) {
    return "";
  }

  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildPmNotificationComplianceCsv(
  rows: PmNotificationReportCsvRow[],
) {
  const columns: Array<{
    header: string;
    value: (row: PmNotificationReportCsvRow) => string | number | null;
  }> = [
    { header: "notification_id", value: (row) => row.notificationId },
    { header: "event_number", value: (row) => row.eventNumber },
    { header: "trigger_type", value: (row) => row.triggerType },
    { header: "recipient_role", value: (row) => row.recipientRole },
    { header: "notification_status", value: (row) => row.notificationStatus },
    {
      header: "notification_created_at",
      value: (row) => row.notificationCreatedAt,
    },
    { header: "dismissed_at", value: (row) => row.dismissedAt },
    { header: "dismissal_minutes", value: (row) => row.dismissalMinutes },
    { header: "next_pm_status_change", value: (row) => row.nextPmStatusChange },
    {
      header: "next_pm_status_changed_at",
      value: (row) => row.nextPmStatusChangedAt,
    },
    {
      header: "pm_status_change_minutes",
      value: (row) => row.pmStatusChangeMinutes,
    },
    { header: "email_queued", value: (row) => row.emailQueued },
    { header: "email_sending", value: (row) => row.emailSending },
    { header: "email_skipped", value: (row) => row.emailSkipped },
    { header: "email_failed", value: (row) => row.emailFailed },
    { header: "email_sent", value: (row) => row.emailSent },
    { header: "email_dead_letter", value: (row) => row.emailDeadLetter },
    { header: "sms_queued", value: (row) => row.smsQueued },
    { header: "sms_sending", value: (row) => row.smsSending },
    { header: "sms_skipped", value: (row) => row.smsSkipped },
    { header: "sms_failed", value: (row) => row.smsFailed },
    { header: "sms_sent", value: (row) => row.smsSent },
    { header: "sms_dead_letter", value: (row) => row.smsDeadLetter },
  ];

  return [
    columns.map((column) => column.header).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(column.value(row))).join(","),
    ),
  ].join("\r\n");
}

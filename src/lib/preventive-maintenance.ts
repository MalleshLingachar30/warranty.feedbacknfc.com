import type {
  PreventiveMaintenanceCadenceType,
  PreventiveMaintenanceEventStatus,
  PreventiveMaintenanceEventType,
} from "@prisma/client";

export const PREVENTIVE_MAINTENANCE_EVENT_TYPES = [
  "preventive_maintenance",
  "calibration",
] as const satisfies readonly PreventiveMaintenanceEventType[];

export const PREVENTIVE_MAINTENANCE_CADENCE_TYPES = [
  "interval_days",
  "month_offsets",
  "manual",
] as const satisfies readonly PreventiveMaintenanceCadenceType[];

export const PREVENTIVE_MAINTENANCE_EVENT_STATUSES = [
  "due",
  "scheduled",
  "in_progress",
  "completed",
  "overdue",
  "cancelled",
] as const satisfies readonly PreventiveMaintenanceEventStatus[];

export type PreventiveMaintenanceDisplayStatus =
  | PreventiveMaintenanceEventStatus
  | "due_soon"
  | "upcoming";

export interface IntervalDaysCadenceConfig {
  intervalDays: number;
}

export interface MonthOffsetsCadenceConfig {
  monthOffsets: number[];
}

export type PreventiveMaintenanceCadenceConfig =
  | IntervalDaysCadenceConfig
  | MonthOffsetsCadenceConfig
  | Record<string, never>;

export interface ExpandPreventiveMaintenanceDueDatesInput {
  cadenceType: PreventiveMaintenanceCadenceType;
  cadenceConfig: unknown;
  installationDate: Date | null | undefined;
  warrantyEndDate?: Date | null;
  maxEventsWithoutWarrantyEnd?: number;
  includeWarrantyEndDate?: boolean;
}

export interface PreventiveMaintenanceEventStatusInput {
  status: PreventiveMaintenanceEventStatus;
  dueDate: Date;
  scheduledFor?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
}

export interface PreventiveMaintenanceCustomerProjectionInput {
  id: string;
  eventNumber: string;
  eventType: PreventiveMaintenanceEventType;
  status: PreventiveMaintenanceEventStatus;
  dueDate: Date;
  scheduledFor: Date | null;
  completedAt: Date | null;
  customerAcknowledgementRequired: boolean;
  customerAcknowledgedAt: Date | null;
  remarks: string | null;
  organization?: {
    name: string;
  } | null;
  assignedServiceCenter?: {
    name: string;
  } | null;
}

export interface PreventiveMaintenanceCustomerEvent {
  id: string;
  eventNumber: string;
  eventType: PreventiveMaintenanceEventType;
  eventTypeLabel: string;
  status: PreventiveMaintenanceDisplayStatus;
  statusLabel: string;
  dueDate: string;
  scheduledFor: string | null;
  completedAt: string | null;
  serviceProviderName: string | null;
  acknowledgementRequired: boolean;
  acknowledgedAt: string | null;
  remarks: string | null;
}

export interface BuildPreventiveMaintenanceAcknowledgementPayloadInput {
  typedCustomerName: string;
  typedCustomerPhone: string;
  sourceCustomerName?: string | null;
  sourceCustomerPhone?: string | null;
  source:
    | "installation_report"
    | "product_customer"
    | "sale_registration"
    | "dispatch_metadata"
    | "manual";
  acknowledgedAt: Date;
  capturedByTechnicianId: string;
  preventiveMaintenanceEventId: string;
}

export function formatPreventiveMaintenanceLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPreventiveMaintenanceEventNumber(sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("PM event sequence must be a positive integer.");
  }

  return `PM-${sequence.toString().padStart(6, "0")}`;
}

export function normalizePreventiveMaintenanceCadenceConfig(
  cadenceType: PreventiveMaintenanceCadenceType,
  value: unknown,
): PreventiveMaintenanceCadenceConfig {
  const record = asRecord(value);

  switch (cadenceType) {
    case "interval_days": {
      const intervalDays = readPositiveInteger(record.intervalDays);

      if (!intervalDays) {
        throw new Error("interval_days cadence requires a positive intervalDays value.");
      }

      return { intervalDays };
    }
    case "month_offsets": {
      const monthOffsets = Array.isArray(record.monthOffsets)
        ? uniquePositiveIntegers(record.monthOffsets)
        : [];

      if (monthOffsets.length === 0) {
        throw new Error("month_offsets cadence requires at least one month offset.");
      }

      return { monthOffsets };
    }
    case "manual":
      return {};
    default:
      assertNever(cadenceType);
  }
}

export function expandPreventiveMaintenanceDueDates(
  input: ExpandPreventiveMaintenanceDueDatesInput,
) {
  if (!input.installationDate) {
    return [];
  }

  const maxEventsWithoutWarrantyEnd =
    input.maxEventsWithoutWarrantyEnd && input.maxEventsWithoutWarrantyEnd > 0
      ? Math.floor(input.maxEventsWithoutWarrantyEnd)
      : 2;
  const includeWarrantyEndDate = input.includeWarrantyEndDate ?? true;
  const cadenceConfig = normalizePreventiveMaintenanceCadenceConfig(
    input.cadenceType,
    input.cadenceConfig,
  );

  switch (input.cadenceType) {
    case "interval_days":
      return expandIntervalDaysDueDates({
        installationDate: input.installationDate,
        warrantyEndDate: input.warrantyEndDate,
        intervalDays: (cadenceConfig as IntervalDaysCadenceConfig).intervalDays,
        maxEventsWithoutWarrantyEnd,
        includeWarrantyEndDate,
      });
    case "month_offsets":
      return expandMonthOffsetDueDates({
        installationDate: input.installationDate,
        warrantyEndDate: input.warrantyEndDate,
        monthOffsets: (cadenceConfig as MonthOffsetsCadenceConfig).monthOffsets,
        maxEventsWithoutWarrantyEnd,
        includeWarrantyEndDate,
      });
    case "manual":
      return [];
    default:
      assertNever(input.cadenceType);
  }
}

export function derivePreventiveMaintenanceDisplayStatus(
  input: PreventiveMaintenanceEventStatusInput,
  now = new Date(),
  dueSoonThresholdDays = 14,
): PreventiveMaintenanceDisplayStatus {
  if (input.status === "completed" || input.completedAt) {
    return "completed";
  }

  if (input.status === "cancelled" || input.cancelledAt) {
    return "cancelled";
  }

  if (input.status === "in_progress") {
    return "in_progress";
  }

  if (input.status === "overdue" || isBeforeCalendarDay(input.dueDate, now)) {
    return "overdue";
  }

  const dueSoonBoundary = addDaysUtc(startOfUtcDay(now), dueSoonThresholdDays);
  if (input.dueDate.getTime() <= dueSoonBoundary.getTime()) {
    return input.status === "scheduled" || input.scheduledFor ? "scheduled" : "due_soon";
  }

  if (input.status === "scheduled" || input.scheduledFor) {
    return "scheduled";
  }

  return "upcoming";
}

export function projectPreventiveMaintenanceEventForCustomer(
  event: PreventiveMaintenanceCustomerProjectionInput,
  now = new Date(),
  dueSoonThresholdDays = 14,
): PreventiveMaintenanceCustomerEvent {
  const status = derivePreventiveMaintenanceDisplayStatus(
    {
      status: event.status,
      dueDate: event.dueDate,
      scheduledFor: event.scheduledFor,
      completedAt: event.completedAt,
    },
    now,
    dueSoonThresholdDays,
  );

  return {
    id: event.id,
    eventNumber: event.eventNumber,
    eventType: event.eventType,
    eventTypeLabel: formatPreventiveMaintenanceLabel(event.eventType),
    status,
    statusLabel: formatPreventiveMaintenanceLabel(status),
    dueDate: event.dueDate.toISOString(),
    scheduledFor: event.scheduledFor?.toISOString() ?? null,
    completedAt: event.completedAt?.toISOString() ?? null,
    serviceProviderName:
      event.assignedServiceCenter?.name ?? event.organization?.name ?? null,
    acknowledgementRequired: event.customerAcknowledgementRequired,
    acknowledgedAt: event.customerAcknowledgedAt?.toISOString() ?? null,
    remarks: event.remarks,
  };
}

export function buildPreventiveMaintenanceAcknowledgementPayload(
  input: BuildPreventiveMaintenanceAcknowledgementPayloadInput,
) {
  const typedCustomerName = input.typedCustomerName.trim();
  const typedCustomerPhone = input.typedCustomerPhone.trim();
  const sourceCustomerName = input.sourceCustomerName?.trim() || null;
  const sourceCustomerPhone = input.sourceCustomerPhone?.trim() || null;
  const phoneMatchedSource = sourceCustomerPhone
    ? normalizePhoneForComparison(typedCustomerPhone) ===
      normalizePhoneForComparison(sourceCustomerPhone)
    : false;

  return {
    acknowledgementMethod: "typed_name_phone",
    typedCustomerName,
    typedCustomerPhone,
    sourceCustomerName,
    sourceCustomerPhone,
    source: input.source,
    phoneMatchedSource,
    acknowledgedAt: input.acknowledgedAt.toISOString(),
    capturedByTechnicianId: input.capturedByTechnicianId,
    preventiveMaintenanceEventId: input.preventiveMaintenanceEventId,
  };
}

export function normalizePhoneForComparison(value: string) {
  return value.replace(/\D/g, "");
}

function expandIntervalDaysDueDates(input: {
  installationDate: Date;
  warrantyEndDate?: Date | null;
  intervalDays: number;
  maxEventsWithoutWarrantyEnd: number;
  includeWarrantyEndDate: boolean;
}) {
  const dates: Date[] = [];
  let nextDate = addDaysUtc(input.installationDate, input.intervalDays);

  while (
    shouldIncludeDueDate({
      dueDate: nextDate,
      warrantyEndDate: input.warrantyEndDate,
      generatedCount: dates.length,
      maxEventsWithoutWarrantyEnd: input.maxEventsWithoutWarrantyEnd,
      includeWarrantyEndDate: input.includeWarrantyEndDate,
    })
  ) {
    dates.push(nextDate);
    nextDate = addDaysUtc(nextDate, input.intervalDays);
  }

  return dates;
}

function expandMonthOffsetDueDates(input: {
  installationDate: Date;
  warrantyEndDate?: Date | null;
  monthOffsets: number[];
  maxEventsWithoutWarrantyEnd: number;
  includeWarrantyEndDate: boolean;
}) {
  const dates = input.monthOffsets
    .map((offset) => addMonthsUtcClamped(input.installationDate, offset))
    .filter((date, index, list) => {
      const firstIndex = list.findIndex((entry) => entry.getTime() === date.getTime());
      return firstIndex === index;
    });

  if (!input.warrantyEndDate) {
    return dates.slice(0, input.maxEventsWithoutWarrantyEnd);
  }

  const warrantyEndDate = input.warrantyEndDate;

  return dates.filter((date) =>
    isDueDateWithinWarrantyWindow({
      dueDate: date,
      warrantyEndDate,
      includeWarrantyEndDate: input.includeWarrantyEndDate,
    }),
  );
}

function shouldIncludeDueDate(input: {
  dueDate: Date;
  warrantyEndDate?: Date | null;
  generatedCount: number;
  maxEventsWithoutWarrantyEnd: number;
  includeWarrantyEndDate: boolean;
}) {
  if (!input.warrantyEndDate) {
    return input.generatedCount < input.maxEventsWithoutWarrantyEnd;
  }

  return isDueDateWithinWarrantyWindow({
    dueDate: input.dueDate,
    warrantyEndDate: input.warrantyEndDate,
    includeWarrantyEndDate: input.includeWarrantyEndDate,
  });
}

function isDueDateWithinWarrantyWindow(input: {
  dueDate: Date;
  warrantyEndDate: Date;
  includeWarrantyEndDate: boolean;
}) {
  return input.includeWarrantyEndDate
    ? input.dueDate.getTime() <= input.warrantyEndDate.getTime()
    : input.dueDate.getTime() < input.warrantyEndDate.getTime();
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsUtcClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(
    date.getUTCDate(),
    daysInUtcMonth(targetYear, normalizedMonth),
  );

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      targetDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function isBeforeCalendarDay(left: Date, right: Date) {
  return startOfUtcDay(left).getTime() < startOfUtcDay(right).getTime();
}

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function uniquePositiveIntegers(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map(readPositiveInteger)
        .filter((value): value is number => typeof value === "number"),
    ),
  ).sort((left, right) => left - right);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled preventive-maintenance value: ${String(value)}`);
}

import "server-only";

import { type IssueSeverity, type Prisma, type TicketStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { DEFAULT_SLA_HOURS, type SlaHours, type SeverityHours } from "@/lib/sla-config";
import { stopTrackingForTicket } from "@/lib/ticket-live-tracking";
import { sendSlaBreachNotification } from "@/lib/warranty-notifications";

type GenericRecord = Record<string, unknown>;

interface ComputeSlaDeadlineInput {
  reportedAt: Date;
  issueSeverity: IssueSeverity;
  organizationSettings: Prisma.JsonValue | null | undefined;
}

interface EscalationCandidateTicket {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  reportedAt: Date;
  assignedAt: Date | null;
  slaResponseDeadline: Date | null;
  slaResolutionDeadline: Date | null;
  slaBreached: boolean;
  escalationLevel: number;
}

export interface SlaSweepResult {
  scannedCount: number;
  updatedCount: number;
  breachedCount: number;
  breachedTicketIds: string[];
}

const ACTIVE_TICKET_STATUSES: TicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

const RESPONSE_SLA_TRACKED_STATUSES: TicketStatus[] = ["reported", "reopened"];
const RESOLUTION_SLA_TRACKED_STATUSES: TicketStatus[] = [
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    if (normalized > 0) {
      return normalized;
    }
  }

  return fallback;
}

function normalizeSeverityHours(
  value: unknown,
  fallback: SeverityHours,
): SeverityHours {
  const source = isRecord(value) ? value : {};

  return {
    low: asPositiveInteger(source.low, fallback.low),
    medium: asPositiveInteger(source.medium, fallback.medium),
    high: asPositiveInteger(source.high, fallback.high),
    critical: asPositiveInteger(source.critical, fallback.critical),
  };
}

function normalizeSlaHours(settings: Prisma.JsonValue | null | undefined): SlaHours {
  const source = isRecord(settings) ? settings : {};
  const sla = isRecord(source.sla) ? source.sla : {};

  return {
    responseHoursBySeverity: normalizeSeverityHours(
      sla.responseHoursBySeverity,
      DEFAULT_SLA_HOURS.responseHoursBySeverity,
    ),
    resolutionHoursBySeverity: normalizeSeverityHours(
      sla.resolutionHoursBySeverity,
      DEFAULT_SLA_HOURS.resolutionHoursBySeverity,
    ),
  };
}

function addHours(base: Date, hours: number): Date {
  const result = new Date(base);
  result.setTime(result.getTime() + hours * 60 * 60 * 1000);
  return result;
}

function needsEscalatedStatus(status: TicketStatus): boolean {
  return (
    status === "reported" ||
    status === "assigned" ||
    status === "technician_enroute" ||
    status === "work_in_progress" ||
    status === "pending_confirmation" ||
    status === "reopened"
  );
}

function getBreachReason(
  ticket: EscalationCandidateTicket,
  now: Date,
): string | null {
  if (
    RESPONSE_SLA_TRACKED_STATUSES.includes(ticket.status) &&
    ticket.slaResponseDeadline instanceof Date &&
    ticket.slaResponseDeadline.getTime() < now.getTime() &&
    ticket.assignedAt === null
  ) {
    return "SLA response deadline breached before technician assignment.";
  }

  if (
    RESOLUTION_SLA_TRACKED_STATUSES.includes(ticket.status) &&
    ticket.slaResolutionDeadline instanceof Date &&
    ticket.slaResolutionDeadline.getTime() < now.getTime()
  ) {
    return "SLA resolution deadline breached before ticket resolution.";
  }

  return null;
}

function isSlaBreachNotificationEnabled(settings: Prisma.JsonValue): boolean {
  if (!isRecord(settings)) {
    return true;
  }

  const notifications = isRecord(settings.notifications)
    ? settings.notifications
    : {};

  if (typeof notifications.notifyOnSlaBreach === "boolean") {
    return notifications.notifyOnSlaBreach;
  }

  return true;
}

export function computeSlaDeadlines(input: ComputeSlaDeadlineInput) {
  const normalized = normalizeSlaHours(input.organizationSettings);
  const severity = input.issueSeverity;

  const responseHours = normalized.responseHoursBySeverity[severity];
  const resolutionHours = normalized.resolutionHoursBySeverity[severity];

  return {
    responseDeadline: addHours(input.reportedAt, responseHours),
    resolutionDeadline: addHours(input.reportedAt, resolutionHours),
  };
}

export async function runSlaSweep(options?: {
  ticketId?: string;
  now?: Date;
}): Promise<SlaSweepResult> {
  const now = options?.now ?? new Date();

  const tickets = await db.ticket.findMany({
    where: {
      ...(options?.ticketId ? { id: options.ticketId } : {}),
      status: {
        in: ACTIVE_TICKET_STATUSES,
      },
    },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      reportedAt: true,
      assignedAt: true,
      issueSeverity: true,
      slaResponseDeadline: true,
      slaResolutionDeadline: true,
      slaBreached: true,
      escalationLevel: true,
      product: {
        select: {
          organization: {
            select: {
              contactEmail: true,
              settings: true,
            },
          },
        },
      },
      assignedServiceCenter: {
        select: {
          email: true,
          organization: {
            select: {
              contactEmail: true,
              settings: true,
            },
          },
        },
      },
    },
  });

  let updatedCount = 0;
  let breachedCount = 0;
  const breachedTicketIds: string[] = [];

  for (const ticket of tickets) {
    const hasBothDeadlines =
      ticket.slaResponseDeadline instanceof Date &&
      ticket.slaResolutionDeadline instanceof Date;

    const computedDeadlines = hasBothDeadlines
      ? null
      : computeSlaDeadlines({
          reportedAt: ticket.reportedAt,
          issueSeverity: ticket.issueSeverity,
          organizationSettings: ticket.product.organization.settings,
        });

    const responseDeadline =
      ticket.slaResponseDeadline ?? computedDeadlines?.responseDeadline ?? null;
    const resolutionDeadline =
      ticket.slaResolutionDeadline ??
      computedDeadlines?.resolutionDeadline ??
      null;

    const breachReason = getBreachReason(
      {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        reportedAt: ticket.reportedAt,
        assignedAt: ticket.assignedAt,
        slaResponseDeadline: responseDeadline,
        slaResolutionDeadline: resolutionDeadline,
        slaBreached: ticket.slaBreached,
        escalationLevel: ticket.escalationLevel,
      },
      now,
    );

    const shouldMarkBreached = Boolean(breachReason);
    const data: Prisma.TicketUpdateInput = {};

    if (computedDeadlines) {
      data.slaResponseDeadline = responseDeadline;
      data.slaResolutionDeadline = resolutionDeadline;
    }

    if (shouldMarkBreached && !ticket.slaBreached) {
      data.slaBreached = true;
      data.escalationReason = breachReason;
      data.escalatedAt = now;
      data.escalationLevel = {
        increment: 1,
      };

      if (needsEscalatedStatus(ticket.status)) {
        data.status = "escalated";
      }
    }

    if (Object.keys(data).length === 0) {
      continue;
    }

    const markedEscalated = data.status === "escalated";

    const operations: Prisma.PrismaPromise<unknown>[] = [
      db.ticket.update({
        where: { id: ticket.id },
        data,
      }),
    ];

    if (shouldMarkBreached && !ticket.slaBreached) {
      operations.push(
        db.ticketTimeline.create({
          data: {
            ticketId: ticket.id,
            eventType: "sla_breached",
            eventDescription: breachReason!,
            actorRole: "system",
            actorName: "SLA Engine",
          },
        }),
      );
    }

    await db.$transaction(operations);
    updatedCount += 1;

    if (markedEscalated) {
      await stopTrackingForTicket({
        ticketId: ticket.id,
        reason: "ticket_escalated",
        actorRole: "system",
      });
    }

    if (shouldMarkBreached && !ticket.slaBreached) {
      breachedCount += 1;
      breachedTicketIds.push(ticket.id);

      const manufacturerWantsNotification = isSlaBreachNotificationEnabled(
        ticket.product.organization.settings,
      );
      const serviceCenterWantsNotification = isSlaBreachNotificationEnabled(
        ticket.assignedServiceCenter?.organization.settings ?? {},
      );

      void sendSlaBreachNotification({
        ticketNumber: ticket.ticketNumber,
        manufacturerEmail: manufacturerWantsNotification
          ? ticket.product.organization.contactEmail
          : undefined,
        serviceCenterEmail: serviceCenterWantsNotification
          ? ticket.assignedServiceCenter?.email ??
            ticket.assignedServiceCenter?.organization.contactEmail
          : undefined,
      });
    }
  }

  return {
    scannedCount: tickets.length,
    updatedCount,
    breachedCount,
    breachedTicketIds,
  };
}

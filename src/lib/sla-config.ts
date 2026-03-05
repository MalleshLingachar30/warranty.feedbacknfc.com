import type { TicketStatus } from "@prisma/client";

export type SeverityHours = {
  low: number;
  medium: number;
  high: number;
  critical: number;
};

export type SlaHours = {
  responseHoursBySeverity: SeverityHours;
  resolutionHoursBySeverity: SeverityHours;
};

export const DEFAULT_SLA_HOURS: SlaHours = {
  responseHoursBySeverity: {
    low: 48,
    medium: 24,
    high: 8,
    critical: 2,
  },
  resolutionHoursBySeverity: {
    low: 72,
    medium: 48,
    high: 24,
    critical: 8,
  },
};

export type SlaIndicatorState = "on_track" | "at_risk" | "breached" | "unknown";

export type SlaIndicator = {
  state: SlaIndicatorState;
  deadline: Date | null;
};

function trackedDeadlineForStatus(input: {
  status: TicketStatus;
  assignedAt: Date | null;
  slaResponseDeadline: Date | null;
  slaResolutionDeadline: Date | null;
}): Date | null {
  const responseTrackedStatuses: TicketStatus[] = ["reported", "reopened"];

  if (
    responseTrackedStatuses.includes(input.status) &&
    input.assignedAt === null
  ) {
    return input.slaResponseDeadline;
  }

  return input.slaResolutionDeadline;
}

export function getSlaIndicator(input: {
  status: TicketStatus;
  assignedAt: Date | null;
  reportedAt: Date;
  slaResponseDeadline: Date | null;
  slaResolutionDeadline: Date | null;
  slaBreached: boolean;
  now?: Date;
}): SlaIndicator {
  const now = input.now ?? new Date();
  const deadline = trackedDeadlineForStatus(input);

  if (input.slaBreached) {
    return {
      state: "breached",
      deadline,
    };
  }

  if (!(deadline instanceof Date)) {
    return {
      state: "unknown",
      deadline: null,
    };
  }

  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return {
      state: "breached",
      deadline,
    };
  }

  const totalMs = Math.max(0, deadline.getTime() - input.reportedAt.getTime());
  const oneHourMs = 60 * 60 * 1000;
  const fourHoursMs = 4 * oneHourMs;
  const dynamicThreshold = totalMs > 0 ? Math.max(oneHourMs, totalMs * 0.2) : fourHoursMs;
  const atRiskThresholdMs = Math.min(fourHoursMs, dynamicThreshold);

  if (remainingMs <= atRiskThresholdMs) {
    return {
      state: "at_risk",
      deadline,
    };
  }

  return {
    state: "on_track",
    deadline,
  };
}

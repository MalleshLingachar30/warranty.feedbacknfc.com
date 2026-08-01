"use client";

import { Clock3, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PreventiveMaintenanceTimelineEntryView } from "@/components/preventive-maintenance/types";

type PmEventTimelineProps = {
  entries: PreventiveMaintenanceTimelineEntryView[];
};

type TimelineMetadata = {
  previousStatus?: unknown;
  nextStatus?: unknown;
  previousScheduledFor?: unknown;
  nextScheduledFor?: unknown;
  cancellationReason?: unknown;
};

function isRecord(value: unknown): value is TimelineMetadata {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMaybeDate(value: unknown) {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    return raw;
  }

  return formatDateTime(raw);
}

function formatStatus(value: unknown) {
  return asString(value)?.replace(/_/g, " ") ?? null;
}

function metadataDetails(metadata: unknown) {
  if (!isRecord(metadata)) {
    return [];
  }

  const details: string[] = [];
  const previousStatus = formatStatus(metadata.previousStatus);
  const nextStatus = formatStatus(metadata.nextStatus);
  const previousScheduledFor = formatMaybeDate(metadata.previousScheduledFor);
  const nextScheduledFor = formatMaybeDate(metadata.nextScheduledFor);
  const cancellationReason = asString(metadata.cancellationReason);

  if (previousStatus && nextStatus && previousStatus !== nextStatus) {
    details.push(`Status ${previousStatus} -> ${nextStatus}`);
  }

  if (previousScheduledFor || nextScheduledFor) {
    details.push(
      `Schedule ${previousScheduledFor ?? "not set"} -> ${
        nextScheduledFor ?? "not set"
      }`,
    );
  }

  if (cancellationReason) {
    details.push(`Reason: ${cancellationReason}`);
  }

  return details;
}

export function PmEventTimeline({ entries }: PmEventTimelineProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Recent timeline</p>
        <Badge variant="outline" className="bg-white text-slate-600">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </Badge>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => {
          const details = metadataDetails(entry.metadata);

          return (
            <div
              key={entry.id}
              className="border-l-2 border-slate-300 pl-3 text-xs text-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {entry.eventTypeLabel}
                  </p>
                  <p className="mt-0.5 text-slate-600">
                    {entry.eventDescription ?? "PM event updated."}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>

              {entry.actorName || entry.actorRole ? (
                <p className="mt-1 flex items-center gap-1 text-slate-500">
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {entry.actorName ?? "System"}
                    {entry.actorRole
                      ? ` / ${entry.actorRole.replace(/_/g, " ")}`
                      : ""}
                  </span>
                </p>
              ) : null}

              {details.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {details.map((detail) => (
                    <Badge
                      key={detail}
                      variant="outline"
                      className="bg-white text-[11px] font-normal text-slate-600"
                    >
                      {detail}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, RefreshCw } from "lucide-react";

import type {
  TechnicianJob,
  TechnicianJobsResponse,
} from "@/components/technician/types";
import {
  formatDateTime,
  statusBadgeClass,
  statusLabel,
} from "@/components/technician/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toIsoDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateKeyForJob(job: TechnicianJob): string {
  const source = job.technicianStartedAt ?? job.reportedAt;
  const date = new Date(source);

  if (!Number.isFinite(date.getTime())) {
    return toIsoDateKey(new Date());
  }

  return toIsoDateKey(date);
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
  }).format(date);
}

function sortByTime(left: TechnicianJob, right: TechnicianJob): number {
  return (
    new Date(left.reportedAt).getTime() - new Date(right.reportedAt).getTime()
  );
}

export function SchedulePanel() {
  const [payload, setPayload] = useState<TechnicianJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    toIsoDateKey(new Date()),
  );

  const fetchSchedule = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/technician/jobs", { method: "GET" });
      const body = (await response.json()) as
        | TechnicianJobsResponse
        | { error?: string };

      if (!response.ok || !("jobs" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to load schedule.")
            : "Unable to load schedule.",
        );
      }

      setPayload(body);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load technician schedule.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule]);

  const scheduleDays = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today.getTime() + index * DAY_IN_MS);
      return {
        key: toIsoDateKey(date),
        date,
      };
    });

    if (!payload) {
      return days;
    }

    const extraFromJobs = payload.jobs
      .map((job) => {
        const date = new Date(job.technicianStartedAt ?? job.reportedAt);
        return Number.isFinite(date.getTime()) ? date : null;
      })
      .filter((entry): entry is Date => Boolean(entry))
      .sort((a, b) => a.getTime() - b.getTime())
      .slice(0, 14)
      .map((date) => ({
        key: toIsoDateKey(date),
        date,
      }));

    const merged = [...days, ...extraFromJobs].reduce((map, entry) => {
      map.set(entry.key, entry);
      return map;
    }, new Map<string, { key: string; date: Date }>());

    return Array.from(merged.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [payload]);

  const jobsForSelectedDate = useMemo(() => {
    if (!payload) {
      return [];
    }

    return payload.jobs
      .filter((job) => {
        const key = dateKeyForJob(job);
        return key === selectedDateKey;
      })
      .sort(sortByTime);
  }, [payload, selectedDateKey]);

  const dateLabel = useMemo(() => {
    const selectedDay = scheduleDays.find((day) => day.key === selectedDateKey);

    if (!selectedDay) {
      return "Selected day";
    }

    return new Intl.DateTimeFormat("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(selectedDay.date);
  }, [scheduleDays, selectedDateKey]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!payload || error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Unable to load schedule</CardTitle>
          <CardDescription>
            {error ?? "No schedule payload found."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-11 w-full" onClick={() => void fetchSchedule()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">My Schedule</CardTitle>
              <CardDescription>
                Calendar view of assigned and active jobs
              </CardDescription>
              <p className="mt-1 text-sm text-slate-600">
                {payload.technician.name}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => void fetchSchedule()}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {scheduleDays.map((day) => {
          const active = day.key === selectedDateKey;

          return (
            <button
              key={day.key}
              className={`min-h-11 min-w-20 rounded-lg border px-3 py-2 text-sm font-medium ${
                active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
              onClick={() => setSelectedDateKey(day.key)}
            >
              {formatDayLabel(day.date)}
            </button>
          );
        })}
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            {dateLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobsForSelectedDate.length === 0 ? (
            <p className="text-sm text-slate-600">
              No jobs scheduled for this date.
            </p>
          ) : (
            jobsForSelectedDate.map((job) => (
              <div
                key={job.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {job.ticketNumber}
                    </p>
                    <p className="text-sm text-slate-700">{job.productName}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(job.status)}
                  >
                    {statusLabel(job.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {job.issueCategory}
                </p>
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatDateTime(job.technicianStartedAt ?? job.reportedAt)}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600">
                  <MapPin className="h-3.5 w-3.5" />
                  {job.customerCity}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

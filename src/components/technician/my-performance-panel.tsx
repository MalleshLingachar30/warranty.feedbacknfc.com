"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, IndianRupee, RefreshCw, Star, Wrench } from "lucide-react";

import type { TechnicianJobsResponse } from "@/components/technician/types";
import { formatCurrency } from "@/components/technician/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function StarRating({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`h-4 w-4 ${index < rounded ? "fill-amber-400 text-amber-500" : "text-slate-300"}`}
        />
      ))}
    </div>
  );
}

export function MyPerformancePanel() {
  const [payload, setPayload] = useState<TechnicianJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPerformance = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/technician/jobs", { method: "GET" });
      const body = (await response.json()) as
        | TechnicianJobsResponse
        | { error?: string };

      if (!response.ok || !("performance" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to load performance.")
            : "Unable to load performance.",
        );
      }

      setPayload(body);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load technician performance.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchPerformance();
  }, [fetchPerformance]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!payload || error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Unable to load performance</CardTitle>
          <CardDescription>
            {error ?? "No performance payload found."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="h-11 w-full"
            onClick={() => void fetchPerformance()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const performance = payload.performance;

  return (
    <section className="space-y-3">
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl">My Performance</CardTitle>
              <CardDescription>
                Weekly and monthly technician performance summary
              </CardDescription>
              <p className="mt-1 text-sm text-slate-600">
                {payload.technician.name}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={() => void fetchPerformance()}
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

      <div className="grid gap-3">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="inline-flex items-center gap-1">
              <Wrench className="h-4 w-4" />
              Jobs Completed
            </CardDescription>
            <CardTitle className="text-3xl">
              {performance.jobsCompletedThisWeek}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            This week • {performance.jobsCompletedThisMonth} this month
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="inline-flex items-center gap-1">
              <Clock3 className="h-4 w-4" />
              Average Resolution Time
            </CardDescription>
            <CardTitle className="text-3xl">
              {performance.averageResolutionTimeHours}h
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Calculated from all completed jobs with start and completion
            timestamps.
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription>Customer Service Rating</CardDescription>
            <CardTitle className="text-3xl">
              {performance.ratedJobsCount > 0
                ? performance.customerRating.toFixed(1)
                : "-"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-600">
            <StarRating value={performance.customerRating} />
            <p>
              {performance.ratedJobsCount > 0
                ? `Based on ${performance.ratedJobsCount.toLocaleString()} customer-confirmed service rating${performance.ratedJobsCount === 1 ? "" : "s"}.`
                : "No customer-confirmed service ratings yet."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="inline-flex items-center gap-1">
              <IndianRupee className="h-4 w-4" />
              Total Claims Value Generated
            </CardDescription>
            <CardTitle className="text-3xl">
              {formatCurrency(performance.totalClaimsValueGenerated)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </section>
  );
}

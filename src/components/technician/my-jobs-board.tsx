"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Briefcase, Clock3, MapPin, RefreshCw } from "lucide-react";

import { JobDetail } from "@/components/technician/job-detail";
import type {
  TechnicianJob,
  TechnicianJobsResponse,
} from "@/components/technician/types";
import {
  type JobTabValue,
  formatRelativeTime,
  selectJobsByTab,
  severityBadgeClass,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MyJobsBoardProps {
  title?: string;
  description?: string;
}

export function MyJobsBoard({
  title = "My Jobs",
  description = "Assigned, active, and completed service jobs",
}: MyJobsBoardProps) {
  const [payload, setPayload] = useState<TechnicianJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<JobTabValue>("assigned");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/technician/jobs", {
        method: "GET",
      });

      const body = (await response.json()) as
        | TechnicianJobsResponse
        | { error?: string };

      if (!response.ok || !("jobs" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to load technician jobs.")
            : "Unable to load jobs.",
        );
      }

      setPayload(body);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load jobs.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const selectedJob = useMemo(() => {
    if (!payload || !selectedJobId) {
      return null;
    }

    return payload.jobs.find((job) => job.id === selectedJobId) ?? null;
  }, [payload, selectedJobId]);

  const jobsForActiveTab = useMemo(() => {
    if (!payload) {
      return [];
    }

    return selectJobsByTab(payload.jobs, activeTab);
  }, [payload, activeTab]);

  const tabCounts = useMemo(() => {
    if (!payload) {
      return {
        assigned: 0,
        inProgress: 0,
        completed: 0,
      };
    }

    return {
      assigned: selectJobsByTab(payload.jobs, "assigned").length,
      inProgress: selectJobsByTab(payload.jobs, "in_progress").length,
      completed: selectJobsByTab(payload.jobs, "completed").length,
    };
  }, [payload]);

  const handleRefresh = async () => {
    await fetchJobs();
  };

  const handleJobUpdated = async (ticketId: string) => {
    await fetchJobs();
    setSelectedJobId(ticketId);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!payload || error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Unable to load jobs</CardTitle>
          <CardDescription>
            {error ?? "No technician payload found."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void handleRefresh()} className="h-11 w-full">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <Card className="border-slate-200">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
              <p className="mt-1 text-sm text-slate-600">
                {payload.technician.name} •{" "}
                {payload.technician.serviceCenterName}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as JobTabValue)}
      >
        <TabsList className="grid h-12 w-full grid-cols-3">
          <TabsTrigger value="assigned" className="h-10 text-xs sm:text-sm">
            Assigned ({tabCounts.assigned})
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="h-10 text-xs sm:text-sm">
            In Progress ({tabCounts.inProgress})
          </TabsTrigger>
          <TabsTrigger value="completed" className="h-10 text-xs sm:text-sm">
            Completed ({tabCounts.completed})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-2 pt-2">
          {jobsForActiveTab.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-600">
                No jobs in this tab right now.
              </CardContent>
            </Card>
          ) : (
            jobsForActiveTab.map((job) => (
              <button
                key={job.id}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
                onClick={() => setSelectedJobId(job.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {job.productName}
                    </p>
                    <p className="text-xs text-slate-500">{job.ticketNumber}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={severityBadgeClass(job.severity)}
                  >
                    {job.severity}
                  </Badge>
                </div>

                <p className="mt-2 text-sm text-slate-900">
                  {job.issueCategory}
                </p>

                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <p className="font-medium text-slate-800">
                    {job.customerName}
                  </p>
                  <p className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {job.customerCity}
                  </p>
                  <p className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    Reported {formatRelativeTime(job.reportedAt)}
                  </p>
                </div>
              </button>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Sheet
        open={Boolean(selectedJob)}
        onOpenChange={(open) => !open && setSelectedJobId(null)}
      >
        <SheetContent
          side="bottom"
          className="h-[96dvh] gap-0 rounded-t-2xl p-0"
          showCloseButton
        >
          {selectedJob ? (
            <>
              <SheetHeader className="border-b border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2"
                    onClick={() => setSelectedJobId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                </div>
                <SheetTitle className="text-left text-lg">
                  {selectedJob.ticketNumber}
                </SheetTitle>
                <SheetDescription className="text-left">
                  <Briefcase className="mr-1 inline-block h-4 w-4" />
                  Job details and actions
                </SheetDescription>
              </SheetHeader>

              <JobDetail
                job={selectedJob as TechnicianJob}
                technicianId={payload.technician.id}
                onClose={() => setSelectedJobId(null)}
                onUpdated={handleJobUpdated}
              />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

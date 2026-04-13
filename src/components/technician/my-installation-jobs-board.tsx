"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Wrench } from "lucide-react";

import { InstallationJobDetail } from "@/components/technician/installation-job-detail";
import type {
  TechnicianInstallationJob,
  TechnicianInstallationJobsResponse,
} from "@/components/technician/types";
import {
  formatDateTime,
  installationStatusBadgeClass,
  workflowLabel,
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

interface MyInstallationJobsBoardProps {
  title?: string;
  description?: string;
}

export function MyInstallationJobsBoard({
  title = "Installation Jobs",
  description = "Execution flow for installation-driven products",
}: MyInstallationJobsBoardProps) {
  const [payload, setPayload] =
    useState<TechnicianInstallationJobsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const fetchJobs = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetch("/api/technician/installation-jobs");
      const body = (await response.json()) as
        | TechnicianInstallationJobsResponse
        | { error?: string };

      if (!response.ok || !("jobs" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to load installation jobs.")
            : "Unable to load installation jobs.",
        );
      }

      setPayload(body);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load installation jobs.",
      );
    } finally {
      setIsLoading(false);
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, []);

  const selectedJob =
    payload?.jobs.find((job) => job.id === selectedJobId) ?? null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!payload || error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Unable to load installation jobs</CardTitle>
          <CardDescription>
            {error ?? "No installation payload found."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-11 w-full" onClick={() => void fetchJobs()}>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
              <p className="mt-1 text-sm text-slate-600">
                {payload.technician.name} • {payload.technician.serviceCenterName}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={() => void fetchJobs()}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {payload.jobs.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-10 text-center text-sm text-slate-600">
            No installation jobs assigned right now.
          </CardContent>
        </Card>
      ) : (
        payload.jobs.map((job: TechnicianInstallationJob) => (
          <button
            key={job.id}
            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
            onClick={() => setSelectedJobId(job.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {job.productModel.name}
                </p>
                <p className="text-xs text-slate-500">{job.jobNumber}</p>
              </div>
              <Badge
                variant="outline"
                className={installationStatusBadgeClass(job.status)}
              >
                {workflowLabel(job.status)}
              </Badge>
            </div>

            <div className="mt-3 space-y-1 text-xs text-slate-600">
              <p>{job.asset.code}</p>
              <p className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDateTime(job.scheduledFor)}
              </p>
              <p className="inline-flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5" />
                {job.installationReport
                  ? `Reported ${formatDateTime(job.installationReport.submittedAt)}`
                  : "Report pending"}
              </p>
            </div>
          </button>
        ))
      )}

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
                <SheetTitle className="text-left text-lg">
                  {selectedJob.jobNumber}
                </SheetTitle>
                <SheetDescription className="text-left">
                  Installation execution and report submission
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto px-4 py-4">
                <InstallationJobDetail
                  job={selectedJob}
                  technicianName={payload.technician.name}
                  onUpdated={async () => {
                    await fetchJobs(true);
                  }}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

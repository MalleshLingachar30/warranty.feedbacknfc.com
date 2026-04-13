"use client";

import { useState } from "react";
import { CalendarClockIcon, Loader2Icon, WrenchIcon } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWorkflowLabel } from "@/lib/installation-workflow";

import type { InstallationJobRow, ServiceCenterOption } from "./types";

type InstallationJobsClientProps = {
  initialJobs: InstallationJobRow[];
  serviceCenters: ServiceCenterOption[];
};

type JobPlanValues = {
  assignedServiceCenterId: string;
  scheduledFor: string;
  status:
    | "pending_assignment"
    | "assigned"
    | "scheduled"
    | "cancelled"
    | "failed";
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function jobStatusClass(status: InstallationJobRow["status"]) {
  switch (status) {
    case "pending_assignment":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "assigned":
    case "scheduled":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "technician_enroute":
    case "on_site":
    case "commissioning":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "cancelled":
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function lifecycleClass(value: InstallationJobRow["assetLifecycleState"]) {
  switch (value) {
    case "sold_pending_installation":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "installation_scheduled":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "installation_in_progress":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function toPlanValues(job: InstallationJobRow): JobPlanValues {
  return {
    assignedServiceCenterId: job.assignedServiceCenter?.id ?? "",
    scheduledFor: toDateTimeLocalValue(job.scheduledFor),
    status:
      job.status === "pending_assignment" ||
      job.status === "assigned" ||
      job.status === "scheduled" ||
      job.status === "cancelled" ||
      job.status === "failed"
        ? job.status
        : "scheduled",
  };
}

export function InstallationJobsClient({
  initialJobs,
  serviceCenters,
}: InstallationJobsClientProps) {
  const [jobs, setJobs] = useState<InstallationJobRow[]>(initialJobs);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<JobPlanValues>({
    assignedServiceCenterId: "",
    scheduledFor: "",
    status: "pending_assignment",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingAssignmentCount = jobs.filter(
    (job) => job.status === "pending_assignment",
  ).length;
  const scheduledCount = jobs.filter(
    (job) => job.status === "scheduled",
  ).length;
  const assignedCenterCount = jobs.filter(
    (job) => job.assignedServiceCenter,
  ).length;

  const openPlanner = (job: InstallationJobRow) => {
    setEditingJobId(job.id);
    setFormValues(toPlanValues(job));
    setError(null);
  };

  const closePlanner = () => {
    setEditingJobId(null);
    setError(null);
  };

  const saveJobPlan = async () => {
    if (!editingJobId) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/manufacturer/installation-jobs/${editingJobId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignedServiceCenterId: formValues.assignedServiceCenterId || null,
            scheduledFor: formValues.scheduledFor || null,
            status: formValues.status,
          }),
        },
      );

      const json = (await response.json()) as {
        error?: string;
        job?: InstallationJobRow;
      };

      if (!response.ok || !json.job) {
        throw new Error(json.error ?? "Unable to update installation job.");
      }

      setJobs((current) =>
        current.map((job) => (job.id === json.job!.id ? json.job! : job)),
      );
      closePlanner();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update installation job.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Installation Queue"
        description="Assign service centers, schedule installation work, and keep the asset lifecycle aligned with queue planning."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Open Jobs"
          value={jobs.length.toLocaleString()}
          description="All seeded installation jobs"
          icon={WrenchIcon}
        />
        <MetricCard
          title="Pending Assignment"
          value={pendingAssignmentCount.toLocaleString()}
          description="Waiting for a service center"
        />
        <MetricCard
          title="With Service Center"
          value={assignedCenterCount.toLocaleString()}
          description="Queue jobs already routed to a partner"
        />
        <MetricCard
          title="Scheduled"
          value={scheduledCount.toLocaleString()}
          description="Jobs with a committed install slot"
          icon={CalendarClockIcon}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Manufacturer Installation Queue</CardTitle>
          <CardDescription>
            Schedule installation-driven assets without activating warranty
            early. Installation report completion remains a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Assigned Center</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Asset Lifecycle</TableHead>
                <TableHead className="text-right">Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No installation jobs have been created yet.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{job.jobNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          Seeded {formatDateTime(job.createdAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Sale reg {formatDateTime(job.saleRegisteredAt)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p>{job.productModel.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.productModel.modelNumber
                            ? `${job.productModel.modelNumber} • `
                            : ""}
                          {job.assetCode}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Serial {job.serialNumber}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.assignedServiceCenter ? (
                        <div className="space-y-1">
                          <p>{job.assignedServiceCenter.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.assignedServiceCenter.city}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Technician {job.assignedTechnicianName ?? "Pending"}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Not assigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(job.scheduledFor)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={jobStatusClass(job.status)}
                      >
                        {formatWorkflowLabel(job.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={lifecycleClass(job.assetLifecycleState)}
                      >
                        {formatWorkflowLabel(job.assetLifecycleState)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPlanner(job)}
                      >
                        Plan Job
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editingJobId)}
        onOpenChange={(open) => !open && closePlanner()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan Installation Job</DialogTitle>
            <DialogDescription>
              Route this job to an authorized service center and optionally lock
              the installation window.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Service Center</label>
              <select
                value={formValues.assignedServiceCenterId}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    assignedServiceCenterId: event.target.value,
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {serviceCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name} ({center.city})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Scheduled For</label>
              <Input
                type="datetime-local"
                value={formValues.scheduledFor}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    scheduledFor: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Queue Status</label>
              <select
                value={formValues.status}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    status: event.target.value as JobPlanValues["status"],
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="pending_assignment">Pending Assignment</option>
                <option value="assigned">Assigned</option>
                <option value="scheduled">Scheduled</option>
                <option value="cancelled">Cancelled</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closePlanner}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveJobPlan()} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Plan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

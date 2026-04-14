"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { InstallationJobStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWorkflowLabel } from "@/lib/installation-workflow";

export type ServiceCenterInstallationQueueJob = {
  id: string;
  jobNumber: string;
  status: InstallationJobStatus;
  scheduledFor: string | null;
  createdAt: string;
  activationTriggeredAt: string | null;
  assignedServiceCenterId: string | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  manufacturerName: string;
  saleRegistration: {
    registeredAt: string;
    dealerName: string | null;
    distributorName: string | null;
  } | null;
  installationReport: {
    submittedAt: string;
    customerName: string;
  } | null;
  asset: {
    publicCode: string;
    serialNumber: string | null;
    lifecycleState: string;
    productModel: {
      name: string;
      modelNumber: string | null;
    };
  };
};

export type ServiceCenterInstallationTechnician = {
  id: string;
  name: string;
  serviceCenterId: string;
  isAvailable: boolean;
  activeJobCount: number;
  maxConcurrentJobs: number;
};

type InstallationQueueClientProps = {
  initialJobs: ServiceCenterInstallationQueueJob[];
  technicians: ServiceCenterInstallationTechnician[];
};

type AssignmentResponse = {
  job?: {
    id: string;
    status: InstallationJobStatus;
    assignedTechnicianId: string | null;
    assignedTechnicianName: string | null;
  };
  error?: string;
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

function installationStatusClass(status: InstallationJobStatus) {
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

function isDispatchable(status: InstallationJobStatus) {
  return (
    status === "pending_assignment" ||
    status === "assigned" ||
    status === "scheduled"
  );
}

function makeSelectionState(
  jobs: ServiceCenterInstallationQueueJob[],
  technicians: ServiceCenterInstallationTechnician[],
) {
  const selection = new Map<string, string>();

  for (const job of jobs) {
    const options = technicians.filter(
      (technician) =>
        technician.serviceCenterId === job.assignedServiceCenterId &&
        (technician.id === job.assignedTechnicianId ||
          (technician.isAvailable &&
            technician.activeJobCount < technician.maxConcurrentJobs)),
    );

    selection.set(job.id, job.assignedTechnicianId ?? options[0]?.id ?? "");
  }

  return Object.fromEntries(selection);
}

export function InstallationQueueClient({
  initialJobs,
  technicians,
}: InstallationQueueClientProps) {
  const [jobs, setJobs] =
    useState<ServiceCenterInstallationQueueJob[]>(initialJobs);
  const [selectedTechnicianByJob, setSelectedTechnicianByJob] = useState<
    Record<string, string>
  >(() => makeSelectionState(initialJobs, technicians));
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [errorByJob, setErrorByJob] = useState<Record<string, string>>({});

  const eligibleTechniciansByCenter = useMemo(() => {
    const map = new Map<string, ServiceCenterInstallationTechnician[]>();

    for (const technician of technicians) {
      const centerId = technician.serviceCenterId;
      const next = map.get(centerId) ?? [];
      next.push(technician);
      map.set(centerId, next);
    }

    return map;
  }, [technicians]);

  const hasAnyTechnician = technicians.length > 0;

  async function assignJob(job: ServiceCenterInstallationQueueJob) {
    const technicianId = selectedTechnicianByJob[job.id];

    if (!technicianId) {
      setErrorByJob((current) => ({
        ...current,
        [job.id]: "Select a technician before dispatching.",
      }));
      return;
    }

    setSavingJobId(job.id);
    setErrorByJob((current) => ({ ...current, [job.id]: "" }));

    try {
      const response = await fetch(
        `/api/service-center/installation-jobs/${job.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignedTechnicianId: technicianId,
          }),
        },
      );

      const payload = (await response.json()) as AssignmentResponse;

      if (!response.ok || !payload.job) {
        throw new Error(payload.error ?? "Unable to assign installation job.");
      }

      const updatedJob = payload.job;
      if (!updatedJob) {
        throw new Error("Unable to assign installation job.");
      }

      setJobs((current) =>
        current.map((entry) =>
          entry.id === updatedJob.id
            ? {
                ...entry,
                status: updatedJob.status,
                assignedTechnicianId: updatedJob.assignedTechnicianId,
                assignedTechnicianName: updatedJob.assignedTechnicianName,
              }
            : entry,
        ),
      );
    } catch (error) {
      setErrorByJob((current) => ({
        ...current,
        [job.id]:
          error instanceof Error
            ? error.message
            : "Unable to assign installation job.",
      }));
    } finally {
      setSavingJobId(null);
    }
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No installation jobs are assigned to this service-center organization
        yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!hasAnyTechnician ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No technicians are available in this organization. Add technicians in
          the Technicians page before dispatching installation jobs.
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Manufacturer</TableHead>
            <TableHead>Commercial Handoff</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Technician</TableHead>
            <TableHead>Report</TableHead>
            <TableHead>Dispatch</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const centerTechnicians =
              (job.assignedServiceCenterId
                ? eligibleTechniciansByCenter.get(job.assignedServiceCenterId)
                : null) ?? [];
            const eligibleTechnicians = centerTechnicians.filter(
              (technician) =>
                technician.id === job.assignedTechnicianId ||
                (technician.isAvailable &&
                  technician.activeJobCount < technician.maxConcurrentJobs),
            );
            const isSaving = savingJobId === job.id;
            const canDispatch = isDispatchable(job.status);
            const noTechniciansForJob =
              job.assignedServiceCenterId !== null &&
              eligibleTechnicians.length === 0;
            const dispatchDisabled =
              isSaving ||
              !canDispatch ||
              noTechniciansForJob ||
              !selectedTechnicianByJob[job.id];

            return (
              <TableRow key={job.id}>
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="font-medium">{job.jobNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDateTime(job.createdAt)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <p>{job.asset.productModel.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.asset.productModel.modelNumber
                        ? `${job.asset.productModel.modelNumber} • `
                        : ""}
                      {job.asset.serialNumber ?? "Serial unavailable"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {job.asset.publicCode} •{" "}
                      {formatWorkflowLabel(job.asset.lifecycleState)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{job.manufacturerName}</TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <p>
                      Registered{" "}
                      {job.saleRegistration
                        ? formatDateTime(job.saleRegistration.registeredAt)
                        : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dealer {job.saleRegistration?.dealerName ?? "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Distributor {job.saleRegistration?.distributorName ?? "-"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{formatDateTime(job.scheduledFor)}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={installationStatusClass(job.status)}
                  >
                    {formatWorkflowLabel(job.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {job.assignedTechnicianName ?? (
                    <span className="text-muted-foreground">Pending</span>
                  )}
                </TableCell>
                <TableCell>
                  {job.installationReport ? (
                    <div className="space-y-0.5">
                      <p>{job.installationReport.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        Submitted{" "}
                        {formatDateTime(job.installationReport.submittedAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Activated {formatDateTime(job.activationTriggeredAt)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Pending</span>
                  )}
                </TableCell>
                <TableCell className="space-y-2">
                  {canDispatch ? (
                    <>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={selectedTechnicianByJob[job.id] ?? ""}
                        onChange={(event) =>
                          setSelectedTechnicianByJob((current) => ({
                            ...current,
                            [job.id]: event.target.value,
                          }))
                        }
                        disabled={isSaving || noTechniciansForJob}
                      >
                        <option value="">Select technician</option>
                        {eligibleTechnicians.map((technician) => (
                          <option key={technician.id} value={technician.id}>
                            {technician.name} ({technician.activeJobCount}/
                            {technician.maxConcurrentJobs})
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        className="h-8 w-full"
                        onClick={() => void assignJob(job)}
                        disabled={dispatchDisabled}
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : job.assignedTechnicianId ? (
                          "Reassign"
                        ) : (
                          "Assign & Dispatch"
                        )}
                      </Button>
                      {noTechniciansForJob ? (
                        <p className="text-xs text-amber-700">
                          No eligible technicians are available for this service
                          center.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Dispatch locked while job is in execution or closed.
                    </p>
                  )}
                  {errorByJob[job.id] ? (
                    <p className="text-xs text-rose-700">{errorByJob[job.id]}</p>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

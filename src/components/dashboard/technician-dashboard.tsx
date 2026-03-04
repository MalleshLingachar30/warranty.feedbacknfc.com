"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Clock3,
  ExternalLink,
  Gauge,
  MapPin,
  Phone,
  Plus,
  Star,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  TechnicianJob,
  TechnicianJobsResponse,
  WarrantyPartCatalogItem,
  WarrantyTicketStatus,
} from "@/lib/warranty-types";

const TECHNICIAN_ID = "tech-bharat-001";

type DashboardSection = "jobs" | "performance";
type JobTabValue = "assigned" | "in_progress" | "completed";

interface PartSelection {
  id: string;
  catalogPartId: string;
  cost: string;
}

function formatRelativeTime(dateValue: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - +new Date(dateValue)) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }

  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDateTime(dateValue: string | null) {
  if (!dateValue) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function severityBadgeClass(severity: TechnicianJob["severity"]) {
  switch (severity) {
    case "critical":
      return "bg-red-600 text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-amber-500 text-white";
    case "low":
      return "bg-emerald-600 text-white";
    default:
      return "";
  }
}

function statusBadgeClass(status: WarrantyTicketStatus) {
  switch (status) {
    case "assigned":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "technician_enroute":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "work_in_progress":
      return "bg-violet-100 text-violet-800 border-violet-200";
    case "pending_confirmation":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function statusLabel(status: WarrantyTicketStatus) {
  return status.replace(/_/g, " ");
}

function selectJobsByTab(jobs: TechnicianJob[], tab: JobTabValue) {
  if (tab === "assigned") {
    return jobs.filter((job) => job.status === "assigned");
  }

  if (tab === "in_progress") {
    return jobs.filter(
      (job) => job.status === "technician_enroute" || job.status === "work_in_progress"
    );
  }

  return jobs.filter(
    (job) => job.status === "pending_confirmation" || job.status === "completed"
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export function TechnicianDashboard() {
  const [payload, setPayload] = useState<TechnicianJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [section, setSection] = useState<DashboardSection>("jobs");
  const [jobTab, setJobTab] = useState<JobTabValue>("assigned");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [resolutionNotes, setResolutionNotes] = useState("");
  const [laborHours, setLaborHours] = useState("1");
  const [beforePhotos, setBeforePhotos] = useState<File[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);
  const [parts, setParts] = useState<PartSelection[]>([]);

  const loadJobs = useCallback(async () => {
    try {
      setError(null);
      setIsRefreshing(true);
      const response = await fetch(`/api/technician/jobs?technicianId=${TECHNICIAN_ID}`, {
        method: "GET",
      });

      const body = (await response.json()) as TechnicianJobsResponse | { error?: string };

      if (!response.ok || !("jobs" in body)) {
        throw new Error("error" in body ? body.error ?? "Unable to load jobs" : "Unable to load jobs");
      }

      setPayload(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load jobs");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

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
    return selectJobsByTab(payload.jobs, jobTab);
  }, [payload, jobTab]);

  const jobCounts = useMemo(() => {
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

  const resetCompletionForm = useCallback((job: TechnicianJob | null) => {
    setResolutionNotes("");
    setLaborHours("1");
    setBeforePhotos([]);
    setAfterPhotos([]);

    if (job && job.partsCatalog.length > 0) {
      setParts([
        {
          id: crypto.randomUUID(),
          catalogPartId: job.partsCatalog[0]?.id ?? "",
          cost: String(job.partsCatalog[0]?.typicalCost ?? 0),
        },
      ]);
      return;
    }

    setParts([]);
  }, []);

  const openJob = useCallback(
    (job: TechnicianJob) => {
      setSelectedJobId(job.id);
      setActionError(null);
      resetCompletionForm(job);
    },
    [resetCompletionForm]
  );

  const closeJob = useCallback(() => {
    setSelectedJobId(null);
    setActionError(null);
  }, []);

  const callActionApi = useCallback(
    async (path: string, method: "POST", body?: Record<string, unknown>) => {
      setActionLoading(true);
      setActionError(null);

      try {
        const response = await fetch(path, {
          method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ technicianId: TECHNICIAN_ID, ...body }),
        });

        const payloadBody = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payloadBody.error ?? "Action failed");
        }

        await loadJobs();
      } catch (apiError) {
        setActionError(apiError instanceof Error ? apiError.message : "Action failed");
      } finally {
        setActionLoading(false);
      }
    },
    [loadJobs]
  );

  const handleAcceptAndNavigate = useCallback(async () => {
    if (!selectedJob) {
      return;
    }

    await callActionApi(`/api/ticket/${selectedJob.id}/enroute`, "POST");
  }, [callActionApi, selectedJob]);

  const handleStartWork = useCallback(async () => {
    if (!selectedJob) {
      return;
    }

    await callActionApi(`/api/ticket/${selectedJob.id}/start`, "POST");
  }, [callActionApi, selectedJob]);

  const handleAddPart = useCallback(
    (catalog: WarrantyPartCatalogItem[]) => {
      const firstPart = catalog[0];
      setParts((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          catalogPartId: firstPart?.id ?? "",
          cost: String(firstPart?.typicalCost ?? 0),
        },
      ]);
    },
    []
  );

  const handlePartChange = useCallback(
    (partId: string, updates: Partial<PartSelection>, catalog: WarrantyPartCatalogItem[]) => {
      setParts((current) =>
        current.map((part) => {
          if (part.id !== partId) {
            return part;
          }

          const updated = { ...part, ...updates };

          if (updates.catalogPartId) {
            const catalogPart = catalog.find((entry) => entry.id === updates.catalogPartId);
            if (catalogPart) {
              updated.cost = String(catalogPart.typicalCost);
            }
          }

          return updated;
        })
      );
    },
    []
  );

  const handleRemovePart = useCallback((partId: string) => {
    setParts((current) => current.filter((part) => part.id !== partId));
  }, []);

  const handleCompleteWork = useCallback(async () => {
    if (!selectedJob) {
      return;
    }

    if (resolutionNotes.trim().length < 10) {
      setActionError("Resolution notes must be at least 10 characters.");
      return;
    }

    if (beforePhotos.length > 5 || afterPhotos.length > 5) {
      setActionError("Upload up to 5 before and 5 after photos.");
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      const [beforePhotoUrls, afterPhotoUrls] = await Promise.all([
        Promise.all(beforePhotos.map((file) => fileToDataUrl(file))),
        Promise.all(afterPhotos.map((file) => fileToDataUrl(file))),
      ]);

      const normalizedParts = parts
        .map((part) => {
          const selectedCatalogPart = selectedJob.partsCatalog.find(
            (catalogEntry) => catalogEntry.id === part.catalogPartId
          );

          return {
            partName: selectedCatalogPart?.name ?? "",
            partNumber: selectedCatalogPart?.partNumber ?? "",
            cost: Number.parseFloat(part.cost) || 0,
          };
        })
        .filter((part) => part.partName.length > 0);

      const response = await fetch(`/api/ticket/${selectedJob.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          technicianId: TECHNICIAN_ID,
          resolutionNotes,
          laborHours: Number.parseFloat(laborHours) || 0,
          partsUsed: normalizedParts,
          beforePhotos: beforePhotoUrls,
          afterPhotos: afterPhotoUrls,
        }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to complete ticket");
      }

      await loadJobs();
      closeJob();
    } catch (completionError) {
      setActionError(
        completionError instanceof Error ? completionError.message : "Failed to complete ticket"
      );
    } finally {
      setActionLoading(false);
    }
  }, [
    afterPhotos,
    beforePhotos,
    closeJob,
    laborHours,
    loadJobs,
    parts,
    resolutionNotes,
    selectedJob,
  ]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 px-3 py-4">
        <div className="mx-auto w-full max-w-md space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </main>
    );
  }

  if (error || !payload) {
    return (
      <main className="min-h-screen bg-slate-100 px-3 py-4">
        <Card className="mx-auto w-full max-w-md border-red-200">
          <CardHeader>
            <CardTitle>Unable to load dashboard</CardTitle>
            <CardDescription>{error ?? "No technician data available"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void loadJobs()} className="h-11 w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const selectedJobMapUrl = selectedJob
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        selectedJob.customerAddress
      )}`
    : "#";

  return (
    <main className="min-h-screen bg-slate-100 pb-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">FeedbackNFC</p>
              <h1 className="mt-1 text-lg font-semibold text-slate-900">Technician Dashboard</h1>
              <p className="text-sm text-slate-600">
                {payload.technician.name} • {payload.technician.serviceCenterName}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => void loadJobs()}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={section === "jobs" ? "default" : "outline"}
            className="h-11"
            onClick={() => setSection("jobs")}
          >
            <Briefcase className="h-4 w-4" />
            My Jobs
          </Button>
          <Button
            variant={section === "performance" ? "default" : "outline"}
            className="h-11"
            onClick={() => setSection("performance")}
          >
            <Gauge className="h-4 w-4" />
            My Performance
          </Button>
        </div>

        {section === "jobs" ? (
          <Tabs value={jobTab} onValueChange={(value) => setJobTab(value as JobTabValue)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="assigned">Assigned ({jobCounts.assigned})</TabsTrigger>
              <TabsTrigger value="in_progress">In Progress ({jobCounts.inProgress})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({jobCounts.completed})</TabsTrigger>
            </TabsList>

            <TabsContent value={jobTab} className="space-y-2">
              {jobsForActiveTab.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-sm text-slate-600">No jobs in this tab.</CardContent>
                </Card>
              ) : (
                jobsForActiveTab.map((job) => (
                  <button
                    key={job.id}
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
                    onClick={() => openJob(job)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{job.productName}</p>
                        <p className="text-xs text-slate-500">{job.ticketNumber}</p>
                      </div>
                      <Badge className={severityBadgeClass(job.severity)}>{job.severity}</Badge>
                    </div>

                    <p className="mt-2 text-sm text-slate-800">{job.issueCategory}</p>

                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <p>{job.customerName}</p>
                      <p className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.customerCity}
                      </p>
                      <p className="flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        Reported {formatRelativeTime(job.reportedAt)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <section className="space-y-2">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Jobs Completed</CardDescription>
                <CardTitle className="text-3xl">{payload.performance.jobsCompletedThisWeek}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                This week • {payload.performance.jobsCompletedThisMonth} this month
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average Resolution Time</CardDescription>
                <CardTitle className="text-3xl">{payload.performance.averageResolutionTimeHours}h</CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Customer Rating</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl">
                  <Star className="h-6 w-6 text-amber-500" />
                  {payload.performance.customerRating || "-"}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Claims Value Generated</CardDescription>
                <CardTitle className="text-3xl">
                  {formatCurrency(payload.performance.totalClaimsValueGenerated)}
                </CardTitle>
              </CardHeader>
            </Card>
          </section>
        )}
      </div>

      <Sheet open={Boolean(selectedJob)} onOpenChange={(open) => !open && closeJob()}>
        <SheetContent side="bottom" className="h-[96dvh] gap-0 rounded-t-2xl p-0" showCloseButton>
          {selectedJob ? (
            <>
              <SheetHeader className="border-b border-slate-200 bg-white px-4 pb-3 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={closeJob}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Badge className={`border ${statusBadgeClass(selectedJob.status)}`}>
                    {statusLabel(selectedJob.status)}
                  </Badge>
                </div>
                <SheetTitle className="text-left text-lg">{selectedJob.ticketNumber}</SheetTitle>
                <SheetDescription className="text-left text-sm">
                  {selectedJob.productName} • {selectedJob.productModelNumber}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4 pb-28">
                <Card className="gap-3 py-4">
                  <CardHeader className="px-4 pb-0">
                    <CardTitle className="text-base">Customer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 text-sm">
                    <p className="font-medium text-slate-900">{selectedJob.customerName}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={`tel:${selectedJob.customerPhone}`} className="w-full">
                        <Button className="h-11 w-full" variant="outline">
                          <Phone className="h-4 w-4" />
                          Call
                        </Button>
                      </a>
                      <a href={selectedJobMapUrl} target="_blank" rel="noreferrer" className="w-full">
                        <Button className="h-11 w-full" variant="outline">
                          <MapPin className="h-4 w-4" />
                          Navigate
                        </Button>
                      </a>
                    </div>
                    <p className="text-slate-700">{selectedJob.customerAddress}</p>
                  </CardContent>
                </Card>

                <Card className="gap-3 py-4">
                  <CardHeader className="px-4 pb-0">
                    <CardTitle className="text-base">Issue Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 text-sm text-slate-700">
                    <p>
                      <span className="font-medium text-slate-900">Category:</span> {selectedJob.issueCategory}
                    </p>
                    <p>{selectedJob.issueDescription}</p>
                    <p>
                      <span className="font-medium text-slate-900">Product Serial:</span>{" "}
                      {selectedJob.productSerialNumber}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">Reported:</span>{" "}
                      {formatDateTime(selectedJob.reportedAt)} ({formatRelativeTime(selectedJob.reportedAt)})
                    </p>
                    {selectedJob.customerPhotos.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {selectedJob.customerPhotos.map((photoUrl, index) => (
                          <Image
                            key={`${photoUrl}-${index}`}
                            src={photoUrl}
                            alt={`Customer issue photo ${index + 1}`}
                            width={240}
                            height={240}
                            unoptimized
                            className="aspect-square w-full rounded-md border border-slate-200 object-cover"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No customer photos attached.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="gap-3 py-4">
                  <CardHeader className="px-4 pb-0">
                    <CardTitle className="text-base">Service History</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 text-sm">
                    {selectedJob.serviceHistory.map((entry) => (
                      <div key={entry.id} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-900">{entry.issueCategory}</p>
                          <Badge variant="outline" className="capitalize">
                            {statusLabel(entry.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{entry.ticketNumber}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.reportedAt)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="gap-3 py-4">
                  <CardHeader className="px-4 pb-0">
                    <CardTitle className="text-base">AI Suggested Parts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 text-sm">
                    {selectedJob.aiSuggestedParts.length === 0 ? (
                      <p className="text-slate-600">No AI suggestions available for this ticket.</p>
                    ) : (
                      selectedJob.aiSuggestedParts.map((part) => (
                        <div key={part.id} className="rounded-md border border-blue-200 bg-blue-50 p-3">
                          <p className="font-medium text-blue-900">{part.name}</p>
                          <p className="text-xs text-blue-800">{part.partNumber}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {selectedJob.status === "work_in_progress" ? (
                  <Card className="gap-3 py-4">
                    <CardHeader className="px-4 pb-0">
                      <CardTitle className="text-base">Complete Work</CardTitle>
                      <CardDescription>Capture resolution details, photos, parts, and labor.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 px-4">
                      <div className="space-y-2">
                        <label htmlFor="resolution-notes" className="text-sm font-medium text-slate-800">
                          Resolution Notes
                        </label>
                        <Textarea
                          id="resolution-notes"
                          value={resolutionNotes}
                          onChange={(event) => setResolutionNotes(event.target.value)}
                          placeholder="Describe diagnosis and repair steps"
                          className="min-h-24"
                        />
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="before-photos" className="text-sm font-medium text-slate-800">
                          Before Photos
                        </label>
                        <Input
                          id="before-photos"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          onChange={(event) =>
                            setBeforePhotos(Array.from(event.target.files ?? []).slice(0, 5))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="after-photos" className="text-sm font-medium text-slate-800">
                          After Photos
                        </label>
                        <Input
                          id="after-photos"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          onChange={(event) =>
                            setAfterPhotos(Array.from(event.target.files ?? []).slice(0, 5))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-800">Parts Used</label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9"
                            onClick={() => handleAddPart(selectedJob.partsCatalog)}
                          >
                            <Plus className="h-4 w-4" />
                            Add Part
                          </Button>
                        </div>

                        {parts.length === 0 ? (
                          <p className="text-xs text-slate-500">No parts added.</p>
                        ) : (
                          <div className="space-y-2">
                            {parts.map((part) => (
                              <div key={part.id} className="grid grid-cols-[1fr_88px_36px] gap-2">
                                <select
                                  value={part.catalogPartId}
                                  className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                                  onChange={(event) =>
                                    handlePartChange(
                                      part.id,
                                      { catalogPartId: event.target.value },
                                      selectedJob.partsCatalog
                                    )
                                  }
                                >
                                  {selectedJob.partsCatalog.map((catalogPart) => (
                                    <option key={catalogPart.id} value={catalogPart.id}>
                                      {catalogPart.name}
                                    </option>
                                  ))}
                                </select>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={part.cost}
                                  onChange={(event) =>
                                    handlePartChange(
                                      part.id,
                                      { cost: event.target.value },
                                      selectedJob.partsCatalog
                                    )
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  onClick={() => handleRemovePart(part.id)}
                                >
                                  <AlertCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="labor-hours" className="text-sm font-medium text-slate-800">
                          Labor Hours
                        </label>
                        <Input
                          id="labor-hours"
                          type="number"
                          inputMode="decimal"
                          value={laborHours}
                          onChange={(event) => setLaborHours(event.target.value)}
                          min="0"
                          step="0.25"
                        />
                      </div>

                      <Button
                        className="h-12 w-full"
                        disabled={actionLoading}
                        onClick={() => void handleCompleteWork()}
                      >
                        <Wrench className="h-4 w-4" />
                        {actionLoading ? "Submitting..." : "Complete Work"}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
              </div>

              <div className="sticky bottom-0 border-t border-slate-200 bg-white p-3">
                {actionError ? (
                  <div className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{actionError}</p>
                  </div>
                ) : null}

                {selectedJob.status === "assigned" ? (
                  <Button
                    className="h-12 w-full"
                    disabled={actionLoading}
                    onClick={() => void handleAcceptAndNavigate()}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {actionLoading ? "Updating..." : "Accept & Start Navigation"}
                  </Button>
                ) : null}

                {selectedJob.status === "technician_enroute" ? (
                  <Button
                    className="h-12 w-full"
                    disabled={actionLoading}
                    onClick={() => void handleStartWork()}
                  >
                    <Wrench className="h-4 w-4" />
                    {actionLoading ? "Updating..." : "Start Work (or Scan Sticker)"}
                  </Button>
                ) : null}

                {selectedJob.status === "pending_confirmation" ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Work completed at {formatDateTime(selectedJob.technicianCompletedAt)}. Waiting for customer
                    confirmation SMS response.
                  </div>
                ) : null}

                {selectedJob.status === "completed" ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    Ticket completed. Claim value: {formatCurrency(selectedJob.claimValue)}.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  );
}

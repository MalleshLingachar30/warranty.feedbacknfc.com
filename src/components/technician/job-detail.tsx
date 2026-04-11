"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Radio,
  Trash2,
  Wrench,
} from "lucide-react";

import type {
  TechnicianJob,
  TechnicianPartCatalogItem,
} from "@/components/technician/types";
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  googleMapsUrl,
  severityBadgeClass,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deletePhotosForOwner,
  listPhotosForOwner,
  prepareQueuedPhotosForSubmission,
  queueFilesForOwner,
  type QueuedPhotoRecord,
} from "@/lib/photo-queue";
import { uploadPhotoFiles } from "@/lib/photo-upload";
import { useTechnicianLiveTracking } from "@/hooks/use-technician-live-tracking";

interface PartSelection {
  id: string;
  catalogPartId: string;
  cost: string;
  quantity: string;
}

interface JobDetailProps {
  job: TechnicianJob;
  technicianId?: string | null;
  onClose: () => void;
  onUpdated: (ticketId: string) => Promise<void> | void;
}

function createSelectionFromCatalog(
  part: TechnicianPartCatalogItem | undefined,
): PartSelection {
  return {
    id: crypto.randomUUID(),
    catalogPartId: part?.id ?? "",
    cost: String(part?.typicalCost ?? 0),
    quantity: "1",
  };
}

export function JobDetail({
  job,
  technicianId,
  onClose,
  onUpdated,
}: JobDetailProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [resolutionNotes, setResolutionNotes] = useState("");
  const [laborHours, setLaborHours] = useState("1");
  const [beforePhotos, setBeforePhotos] = useState<File[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);
  const [queuedBeforePhotos, setQueuedBeforePhotos] = useState<
    QueuedPhotoRecord[]
  >([]);
  const [queuedAfterPhotos, setQueuedAfterPhotos] = useState<
    QueuedPhotoRecord[]
  >([]);
  const [parts, setParts] = useState<PartSelection[]>([]);
  const trackingEnabled =
    Boolean(technicianId) &&
    (job.status === "technician_enroute" || job.status === "work_in_progress");
  const liveTracking = useTechnicianLiveTracking({
    ticketId: job.id,
    enabled: trackingEnabled,
    phase: job.status === "work_in_progress" ? "on_site" : "enroute",
  });

  useEffect(() => {
    let active = true;

    setResolutionNotes(job.resolutionNotes ?? "");
    setLaborHours(job.laborHours ? String(job.laborHours) : "1");
    setBeforePhotos([]);
    setAfterPhotos([]);
    setQueuedBeforePhotos([]);
    setQueuedAfterPhotos([]);
    setActionError(null);
    setActionSuccess(null);

    void Promise.all([
      listPhotosForOwner(job.id, "before"),
      listPhotosForOwner(job.id, "after"),
    ]).then(([beforeQueued, afterQueued]) => {
      if (!active) {
        return;
      }

      setQueuedBeforePhotos(beforeQueued);
      setQueuedAfterPhotos(afterQueued);
    });

    if (job.partsCatalog.length > 0) {
      setParts([createSelectionFromCatalog(job.partsCatalog[0])]);
    } else {
      setParts([]);
    }

    return () => {
      active = false;
    };
  }, [job]);

  const mapLink = useMemo(
    () => googleMapsUrl(job.customerAddress),
    [job.customerAddress],
  );

  const liveTrackingLabel = useMemo(() => {
    switch (liveTracking.status) {
      case "requesting_permission":
        return "Waiting for location permission";
      case "active":
        return "Live location sharing active";
      case "offline":
        return "Offline - sharing paused";
      case "paused":
        return "Sharing paused";
      case "permission_denied":
        return "Location permission denied";
      case "error":
        return "Unable to start live location";
      default:
        return "Live sharing inactive";
    }
  }, [liveTracking.status]);

  const runTicketAction = async (
    path: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          technicianId: technicianId ?? undefined,
          ...body,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Action failed.");
      }

      setActionSuccess(successMessage);
      await onUpdated(job.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptAndNavigate = async () => {
    await runTicketAction(
      `/api/ticket/${job.id}/enroute`,
      {},
      "Job accepted. Navigation started.",
    );
  };

  const handleStartWork = async () => {
    await runTicketAction(
      `/api/ticket/${job.id}/start`,
      {},
      "Work started. Customer has been notified.",
    );
  };

  const handlePartChange = (
    partId: string,
    updates: Partial<PartSelection>,
  ) => {
    setParts((previous) =>
      previous.map((part) => {
        if (part.id !== partId) {
          return part;
        }

        const merged = { ...part, ...updates };

        if (updates.catalogPartId) {
          const matched = job.partsCatalog.find(
            (catalogPart) => catalogPart.id === updates.catalogPartId,
          );

          if (matched) {
            merged.cost = String(matched.typicalCost);
          }
        }

        return merged;
      }),
    );
  };

  const updatePhotoSelection = async (
    slot: "before" | "after",
    files: File[],
  ) => {
    const limitedFiles = files.slice(0, 10);
    const setFiles = slot === "before" ? setBeforePhotos : setAfterPhotos;
    const setQueued =
      slot === "before" ? setQueuedBeforePhotos : setQueuedAfterPhotos;
    const photoLabel = slot === "before" ? "Before" : "After";

    setActionError(null);

    try {
      await deletePhotosForOwner(job.id, slot);
      setQueued([]);

      if (limitedFiles.length === 0) {
        setFiles([]);
        return;
      }

      if (navigator.onLine) {
        setFiles(limitedFiles);
        return;
      }

      const queued = await queueFilesForOwner({
        ownerId: job.id,
        slot,
        files: limitedFiles,
      });

      setFiles([]);
      setQueued(queued);
      setActionSuccess(
        `${photoLabel} photos saved offline. Reconnect before submitting this job.`,
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : `Unable to queue ${photoLabel.toLowerCase()} photos.`,
      );
    }
  };

  const renderPhotoSelection = (
    files: File[],
    queuedPhotos: QueuedPhotoRecord[],
  ) => {
    if (files.length === 0 && queuedPhotos.length === 0) {
      return null;
    }

    return (
      <div className="space-y-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-600">
        {files.map((file) => (
          <p key={`${file.name}-${file.lastModified}`}>{file.name}</p>
        ))}
        {queuedPhotos.map((photo) => (
          <div
            key={photo.id}
            className="flex items-center justify-between gap-3 rounded-md bg-white px-2 py-1"
          >
            <span className="truncate">{photo.fileName}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">
              {photo.uploadStatus}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const handleCompleteWork = async () => {
    setActionError(null);
    setActionSuccess(null);

    if (resolutionNotes.trim().length < 10) {
      setActionError("Resolution notes must be at least 10 characters.");
      return;
    }

    if (
      beforePhotos.length +
        afterPhotos.length +
        queuedBeforePhotos.length +
        queuedAfterPhotos.length >
      10
    ) {
      setActionError("Upload up to 10 total before/after photos.");
      return;
    }

    if (!navigator.onLine) {
      setActionError(
        "Reconnect to submit this job. Queued photos will upload automatically once you are back online.",
      );
      return;
    }

    setActionLoading(true);

    try {
      const [queuedBeforeResult, queuedAfterResult] = await Promise.all([
        prepareQueuedPhotosForSubmission(job.id, "before"),
        prepareQueuedPhotosForSubmission(job.id, "after"),
      ]);

      if (
        queuedBeforeResult.status === "offline" ||
        queuedAfterResult.status === "offline"
      ) {
        throw new Error(
          "Reconnect to upload queued photos before submitting this job.",
        );
      }

      if (
        queuedBeforeResult.status === "pending" ||
        queuedAfterResult.status === "pending"
      ) {
        throw new Error(
          "Queued photos are still uploading. Please wait a moment and try again.",
        );
      }

      if (
        queuedBeforeResult.status === "failed" ||
        queuedAfterResult.status === "failed"
      ) {
        throw new Error(
          "Some queued photos failed to upload. Re-select them while online and try again.",
        );
      }

      const [beforePhotoUrls, afterPhotoUrls] = await Promise.all([
        uploadPhotoFiles(beforePhotos),
        uploadPhotoFiles(afterPhotos),
      ]);

      const partsUsed = parts
        .map((entry) => {
          const catalogPart = job.partsCatalog.find(
            (catalog) => catalog.id === entry.catalogPartId,
          );

          return {
            partName: catalogPart?.name ?? "",
            partNumber: catalogPart?.partNumber ?? "",
            cost: Number.parseFloat(entry.cost),
            quantity: Math.max(
              1,
              Math.floor(Number.parseFloat(entry.quantity) || 1),
            ),
          };
        })
        .filter((part) => part.partName && Number.isFinite(part.cost));

      const response = await fetch(`/api/ticket/${job.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          technicianId: technicianId ?? undefined,
          resolutionNotes: resolutionNotes.trim(),
          laborHours: Number.parseFloat(laborHours) || 0,
          beforePhotos: [...queuedBeforeResult.urls, ...beforePhotoUrls],
          afterPhotos: [...queuedAfterResult.urls, ...afterPhotoUrls],
          partsUsed,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to complete ticket.");
      }

      setActionSuccess("Work completed. Waiting for customer confirmation.");
      await Promise.all([
        deletePhotosForOwner(job.id, "before"),
        deletePhotosForOwner(job.id, "after"),
      ]);
      setQueuedBeforePhotos([]);
      setQueuedAfterPhotos([]);
      await onUpdated(job.id);
      onClose();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to complete ticket.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
              Job Detail
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              {job.ticketNumber}
            </h2>
            <p className="text-sm text-slate-600">
              {job.productName} •{" "}
              {job.productModelNumber || "Model unavailable"}
            </p>
          </div>
          <Badge variant="outline" className={statusBadgeClass(job.status)}>
            {statusLabel(job.status)}
          </Badge>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-32">
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{job.customerName}</p>
            <p>{job.customerAddress}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <a href={`tel:${job.customerPhone}`}>
                <Button variant="outline" className="h-11 w-full">
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
              </a>
              <a href={mapLink} target="_blank" rel="noreferrer">
                <Button variant="outline" className="h-11 w-full">
                  <MapPin className="h-4 w-4" />
                  Open Map
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-slate-900">{job.issueCategory}</p>
              <Badge
                variant="outline"
                className={severityBadgeClass(job.severity)}
              >
                {job.severity}
              </Badge>
            </div>
            <p>{job.issueDescription}</p>
            <p>
              <span className="font-medium text-slate-900">Reported:</span>{" "}
              {formatDateTime(job.reportedAt)} (
              {formatRelativeTime(job.reportedAt)})
            </p>
            <p>
              <span className="font-medium text-slate-900">
                Product Serial:
              </span>{" "}
              {job.productSerialNumber || "Unavailable"}
            </p>
            {job.customerPhotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                {job.customerPhotos.map((photoUrl, index) => (
                  <Image
                    key={`${photoUrl}-${index}`}
                    src={photoUrl}
                    alt={`Customer photo ${index + 1}`}
                    width={240}
                    height={240}
                    unoptimized
                    className="aspect-square w-full rounded-md border border-slate-200 object-cover"
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No customer photos attached.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Service History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {job.serviceHistory.length === 0 ? (
              <p className="text-slate-600">No prior service history found.</p>
            ) : (
              job.serviceHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {entry.issueCategory}
                    </p>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass(entry.status)}
                    >
                      {statusLabel(entry.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {entry.ticketNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDateTime(entry.reportedAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AI Suggested Parts</CardTitle>
            <CardDescription>
              Derived from issue category and product model catalog.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {job.aiSuggestedParts.length === 0 ? (
              <p className="text-slate-600">No suggestions available.</p>
            ) : (
              job.aiSuggestedParts.map((part) => (
                <div
                  key={part.id}
                  className="rounded-md border border-blue-200 bg-blue-50 p-3"
                >
                  <p className="font-medium text-blue-900">{part.name}</p>
                  <p className="text-xs text-blue-700">
                    {part.partNumber || "Part number unavailable"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {job.status === "work_in_progress" ? (
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Complete Work</CardTitle>
              <CardDescription>
                Add notes, before/after photos, parts used, and labor hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="resolution-notes"
                  className="text-sm font-medium text-slate-800"
                >
                  Resolution notes
                </label>
                <Textarea
                  id="resolution-notes"
                  value={resolutionNotes}
                  onChange={(event) => setResolutionNotes(event.target.value)}
                  className="min-h-24"
                  placeholder="Describe diagnosis and repair steps"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="before-photos"
                  className="text-sm font-medium text-slate-800"
                >
                  Before photos (up to 10 combined)
                </label>
                <Input
                  id="before-photos"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(event) =>
                    void updatePhotoSelection(
                      "before",
                      Array.from(event.target.files ?? []),
                    )
                  }
                />
                {renderPhotoSelection(beforePhotos, queuedBeforePhotos)}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="after-photos"
                  className="text-sm font-medium text-slate-800"
                >
                  After photos
                </label>
                <Input
                  id="after-photos"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(event) =>
                    void updatePhotoSelection(
                      "after",
                      Array.from(event.target.files ?? []),
                    )
                  }
                />
                {renderPhotoSelection(afterPhotos, queuedAfterPhotos)}
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="text-sm font-medium text-slate-800">
                    Parts used
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() =>
                      setParts((prev) => [
                        ...prev,
                        createSelectionFromCatalog(job.partsCatalog[0]),
                      ])
                    }
                    disabled={job.partsCatalog.length === 0}
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
                      <div
                        key={part.id}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_88px_88px_40px]"
                      >
                        <select
                          value={part.catalogPartId}
                          className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                          onChange={(event) =>
                            handlePartChange(part.id, {
                              catalogPartId: event.target.value,
                            })
                          }
                        >
                          {job.partsCatalog.map((catalogPart) => (
                            <option key={catalogPart.id} value={catalogPart.id}>
                              {catalogPart.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={part.quantity}
                          onChange={(event) =>
                            handlePartChange(part.id, {
                              quantity: event.target.value,
                            })
                          }
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={part.cost}
                          onChange={(event) =>
                            handlePartChange(part.id, {
                              cost: event.target.value,
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            setParts((previous) =>
                              previous.filter((item) => item.id !== part.id),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="labor-hours"
                  className="text-sm font-medium text-slate-800"
                >
                  Labor hours
                </label>
                <Input
                  id="labor-hours"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.25"
                  value={laborHours}
                  onChange={(event) => setLaborHours(event.target.value)}
                />
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Estimated claim value: {formatCurrency(job.claimValue)}
              </div>
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

        {actionSuccess ? (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{actionSuccess}</p>
          </div>
        ) : null}

        {trackingEnabled ? (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <Radio className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{liveTrackingLabel}</p>
          </div>
        ) : null}

        {job.status === "assigned" ? (
          <Button
            className="h-12 w-full"
            disabled={actionLoading}
            onClick={handleAcceptAndNavigate}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {actionLoading ? "Updating..." : "Accept & Start Navigation"}
          </Button>
        ) : null}

        {job.status === "technician_enroute" ? (
          <Button
            className="h-12 w-full"
            disabled={actionLoading}
            onClick={handleStartWork}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            {actionLoading ? "Updating..." : "Start Work"}
          </Button>
        ) : null}

        {job.status === "work_in_progress" ? (
          <Button
            className="h-12 w-full"
            disabled={actionLoading}
            onClick={handleCompleteWork}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            {actionLoading ? "Submitting..." : "Complete Work"}
          </Button>
        ) : null}

        {job.status === "pending_confirmation" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Work completed at {formatDateTime(job.technicianCompletedAt)}.
            Waiting for customer confirmation.
          </div>
        ) : null}

        {job.status === "resolved" || job.status === "closed" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Ticket finished. Claim value: {formatCurrency(job.claimValue)}.
          </div>
        ) : null}
      </div>
    </div>
  );
}

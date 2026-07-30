"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Loader2, Phone, Wrench } from "lucide-react";

import type { TechnicianPreventiveMaintenanceJob } from "@/components/technician/types";
import {
  formatDateTime,
  googleMapsUrl,
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
import { uploadPhotoFiles } from "@/lib/photo-upload";

type PreventiveMaintenanceJobDetailProps = {
  job: TechnicianPreventiveMaintenanceJob;
  onClose: () => void;
  onUpdated: (jobId: string) => Promise<void> | void;
};

function templateItems(job: TechnicianPreventiveMaintenanceJob) {
  return job.eventType === "calibration"
    ? job.calibrationTemplate
    : job.checklistTemplate;
}

export function PreventiveMaintenanceJobDetail({
  job,
  onClose,
  onUpdated,
}: PreventiveMaintenanceJobDetailProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(
    () => new Set(),
  );
  const [remarks, setRemarks] = useState(job.remarks ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const items = useMemo(() => templateItems(job), [job]);
  const mapLink = useMemo(
    () => googleMapsUrl(job.customerAddress),
    [job.customerAddress],
  );

  const toggleItem = (item: string) => {
    setCheckedItems((current) => {
      const next = new Set(current);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  };

  const runAction = async (path: string, body: Record<string, unknown>) => {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update PM job.");
      }

      await onUpdated(job.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update PM job.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const startWork = async () => {
    await runAction(`/api/technician/preventive-maintenance/${job.id}/start`, {});
    setSuccess("Preventive maintenance started.");
  };

  const completeWork = async () => {
    if (remarks.trim().length < 10) {
      setError("Remarks must be at least 10 characters.");
      return;
    }

    if (items.some((item) => !checkedItems.has(item))) {
      setError("Complete every checklist item before submitting.");
      return;
    }

    if (photos.length > 10) {
      setError("Upload up to 10 photos.");
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const photoUrls = await uploadPhotoFiles(photos);
      const response = await fetch(
        `/api/technician/preventive-maintenance/${job.id}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            remarks: remarks.trim(),
            checklistCompleted: items,
            photoUrls,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to complete PM job.");
      }

      await onUpdated(job.id);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete PM job.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
              Preventive Maintenance
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              {job.eventNumber}
            </h2>
            <p className="text-sm text-slate-600">
              {job.productName} / {job.assetCode}
            </p>
          </div>
          <Badge variant="outline" className={statusBadgeClass(job.status)}>
            {statusLabel(job.status)}
          </Badge>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-28">
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer And Asset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div>
              <p className="font-medium text-slate-900">{job.customerName}</p>
              <p>{job.customerAddress}</p>
              <p className="text-xs text-slate-500">
                {job.customerCity}
                {job.customerPincode ? ` - ${job.customerPincode}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {job.customerPhone ? (
                <a href={`tel:${job.customerPhone}`}>
                  <Button variant="outline" className="h-11 w-full">
                    <Phone className="h-4 w-4" />
                    Call
                  </Button>
                </a>
              ) : null}
              <a href={mapLink} target="_blank" rel="noreferrer">
                <Button variant="outline" className="h-11 w-full">
                  <CalendarClock className="h-4 w-4" />
                  Open Map
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Visit Plan</CardTitle>
            <CardDescription>
              {job.planName ?? job.eventTypeLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium text-slate-900">Due:</span>{" "}
              {formatDateTime(job.dueDate)}
            </p>
            <p>
              <span className="font-medium text-slate-900">Scheduled:</span>{" "}
              {formatDateTime(job.scheduledFor)}
            </p>
            <p>
              <span className="font-medium text-slate-900">Serial:</span>{" "}
              {job.productSerialNumber || "Unavailable"}
            </p>
          </CardContent>
        </Card>

        {job.status === "in_progress" ? (
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Complete PM</CardTitle>
              <CardDescription>
                Capture checklist, remarks, and site photos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((item) => (
                    <label
                      key={item}
                      className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checkedItems.has(item)}
                        onChange={() => toggleItem(item)}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  No checklist template was configured for this event.
                </p>
              )}

              <label className="space-y-2 text-sm font-medium">
                Remarks
                <Textarea
                  value={remarks}
                  className="min-h-28"
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Record inspection notes, readings, and corrective work"
                />
              </label>

              <label className="space-y-2 text-sm font-medium">
                Photos
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(event) =>
                    setPhotos(Array.from(event.target.files ?? []).slice(0, 10))
                  }
                />
              </label>

              {photos.length > 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-600">
                  {photos.map((photo) => (
                    <p key={`${photo.name}-${photo.lastModified}`}>
                      {photo.name}
                    </p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {job.status === "completed" ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardHeader>
              <CardTitle className="text-base text-emerald-900">
                PM Completed
              </CardTitle>
              <CardDescription className="text-emerald-800">
                Completed at {formatDateTime(job.completedAt)}.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white p-3">
        {error ? (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{success}</p>
          </div>
        ) : null}

        {job.status === "due" ||
        job.status === "overdue" ||
        job.status === "scheduled" ? (
          <Button
            className="h-12 w-full"
            disabled={isSubmitting}
            onClick={() => void startWork()}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            {isSubmitting ? "Updating..." : "Start PM Work"}
          </Button>
        ) : null}

        {job.status === "in_progress" ? (
          <Button
            className="h-12 w-full"
            disabled={isSubmitting}
            onClick={() => void completeWork()}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isSubmitting ? "Submitting..." : "Complete PM"}
          </Button>
        ) : null}

        {job.status === "completed" || job.status === "cancelled" ? (
          <Button className="h-12 w-full" variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
    </div>
  );
}

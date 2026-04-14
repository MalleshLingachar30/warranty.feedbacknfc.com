"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Loader2,
  Plus,
  PlayCircle,
  Radio,
  Route,
  ScanSearch,
  Trash2,
  Wrench,
} from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { ProductView, TicketView } from "@/components/nfc/types";
import { formatDate } from "@/components/nfc/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  parsePartScanFromQuery,
  partScanSignature,
} from "@/lib/part-scan-handoff";
import { getWarrantyAppBaseUrl } from "@/lib/warranty-app-url";
import { useTechnicianLiveTracking } from "@/hooks/use-technician-live-tracking";

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

interface PartSelection {
  id: string;
  catalogPartId: string;
  assetCode: string;
  tagCode: string;
  usageType: "installed" | "consumed" | "returned_unused" | "removed";
  cost: string;
  quantity: string;
}

function createPartSelection(part?: {
  id: string;
  typicalCost: number;
}): PartSelection {
  return {
    id: crypto.randomUUID(),
    catalogPartId: part?.id ?? "",
    assetCode: "",
    tagCode: "",
    usageType: "consumed",
    cost: String(part?.typicalCost ?? 0),
    quantity: "1",
  };
}

interface TechnicianAssetInfoProps {
  product: ProductView;
  openTicket: TicketView | null;
  assignedToCurrentTechnician: boolean;
}

export function TechnicianAssetInfo({
  product,
  openTicket,
  assignedToCurrentTechnician,
}: TechnicianAssetInfoProps) {
  return (
    <NfcPublicShell
      title="Technician Read-Only View"
      description="This sticker is linked to a product. You can review context before taking action from your assigned jobs."
      footer="Open your technician dashboard for assignment-controlled actions."
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Product Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            {product.model?.name ?? "Product"}
          </p>
          <p>Model: {product.model?.modelNumber ?? "Not available"}</p>
          <p>Serial: {product.serialNumber ?? "Not available"}</p>
          <p>Warranty: {statusLabel(product.warrantyStatus)}</p>
          <p>Manufacturer: {product.organizationName ?? "Not available"}</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Ticket Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          {!openTicket ? (
            <p>No open ticket exists for this product.</p>
          ) : (
            <>
              <p className="font-medium text-slate-900">
                {openTicket.ticketNumber}
              </p>
              <p>Status: {statusLabel(openTicket.status)}</p>
              <p>Issue: {openTicket.issueDescription}</p>
              <p>
                Assigned Technician:{" "}
                {openTicket.assignedTechnicianName ?? "Not assigned"}
              </p>
              {!assignedToCurrentTechnician ? (
                <p className="inline-flex items-center gap-1 text-amber-700">
                  <CircleAlert className="h-4 w-4" />
                  This ticket is not assigned to your technician profile.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </NfcPublicShell>
  );
}

interface TechnicianStartWorkProps {
  ticket: TicketView;
  technicianId: string | null;
}

export function TechnicianStartWork({
  ticket,
  technicianId,
}: TechnicianStartWorkProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(
    ticket.status === "technician_enroute" || ticket.status === "work_in_progress",
  );
  const [trackingPhase, setTrackingPhase] = useState<"enroute" | "on_site">(
    ticket.status === "work_in_progress" ? "on_site" : "enroute",
  );

  const canStart = Boolean(technicianId);
  const liveTracking = useTechnicianLiveTracking({
    ticketId: ticket.id,
    enabled: Boolean(technicianId) && trackingEnabled,
    phase: trackingPhase,
  });

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

  useEffect(() => {
    setTrackingEnabled(
      ticket.status === "technician_enroute" || ticket.status === "work_in_progress",
    );
    setTrackingPhase(ticket.status === "work_in_progress" ? "on_site" : "enroute");
  }, [ticket.id, ticket.status]);

  const postAction = async (endpoint: "enroute" | "start") => {
    if (!technicianId) {
      setError("Technician profile is not available for this user.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/ticket/${ticket.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId }),
      });

      const payload = (await response.json()) as {
        error?: string;
        status?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to update ticket.");
        return;
      }

      if (endpoint === "enroute") {
        setTrackingEnabled(true);
        setTrackingPhase("enroute");
        setMessage("Marked en route successfully. Customer has been notified.");
      } else {
        setTrackingEnabled(true);
        setTrackingPhase("on_site");
        setMessage("Work started successfully.");
      }
    } catch {
      setError("Network error while updating ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NfcPublicShell
      title="Technician Work Start"
      description="This ticket is assigned to you. Confirm travel or begin work from this sticker scan."
      footer="Use this page after each scan to update job state quickly."
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">{ticket.ticketNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>Issue: {ticket.issueDescription}</p>
          <p>Reported: {formatDate(ticket.reportedAt)}</p>
          <p>Status: {statusLabel(ticket.status)}</p>
        </CardContent>
      </Card>

      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {trackingEnabled ? (
        <p className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <Radio className="h-3.5 w-3.5" />
          {liveTrackingLabel}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          className="h-11 gap-2"
          variant="outline"
          disabled={!canStart || isSubmitting}
          onClick={() => postAction("enroute")}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Route className="h-4 w-4" />
          )}
          Mark En Route
        </Button>
        <Button
          className="h-11 gap-2"
          disabled={!canStart || isSubmitting}
          onClick={() => postAction("start")}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Start Work
        </Button>
      </div>
    </NfcPublicShell>
  );
}

interface TechnicianCompleteWorkProps {
  ticket: TicketView;
  technicianId: string | null;
}

export function TechnicianCompleteWork({
  ticket,
  technicianId,
}: TechnicianCompleteWorkProps) {
  const searchParams = useSearchParams();
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consumedScannedRowsRef = useRef<Set<string>>(new Set());
  const scannedPart = useMemo(
    () => parsePartScanFromQuery(searchParams),
    [searchParams],
  );
  const liveTracking = useTechnicianLiveTracking({
    ticketId: ticket.id,
    enabled: Boolean(technicianId) && ticket.status === "work_in_progress",
    phase: "on_site",
  });
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

  useEffect(() => {
    let active = true;

    setResolutionNotes("");
    setLaborHours("1");
    setBeforePhotos([]);
    setAfterPhotos([]);
    setQueuedBeforePhotos([]);
    setQueuedAfterPhotos([]);
    setParts([]);
    setMessage(null);
    setError(null);

    void Promise.all([
      listPhotosForOwner(ticket.id, "before"),
      listPhotosForOwner(ticket.id, "after"),
    ]).then(([beforeQueued, afterQueued]) => {
      if (!active) {
        return;
      }

      setQueuedBeforePhotos(beforeQueued);
      setQueuedAfterPhotos(afterQueued);
    });

    return () => {
      active = false;
    };
  }, [ticket]);

  const scannedPartBlockingError = useMemo(() => {
    if (scannedPart.error) {
      return scannedPart.error;
    }

    if (!scannedPart.scan) {
      return null;
    }

    if (!scannedPart.context.ticketId) {
      return "Scanned part is missing ticket context. Re-open this ticket from the resolver action link.";
    }

    if (scannedPart.context.ticketId !== ticket.id) {
      return "Scanned part context points to a different ticket. Re-scan from this ticket workflow.";
    }

    if (scannedPart.scan.organizationId !== ticket.organizationId) {
      return "This scanned part belongs to another manufacturer and cannot be linked to this ticket.";
    }

    return null;
  }, [scannedPart, ticket.id, ticket.organizationId]);

  useEffect(() => {
    const scan = scannedPart.scan;
    if (!scan || scannedPartBlockingError) {
      return;
    }

    const rowKey = `${ticket.id}:${partScanSignature(scan)}`;
    if (consumedScannedRowsRef.current.has(rowKey)) {
      return;
    }

    const normalizedPartNumber = scan.partNumber?.toLowerCase() ?? null;
    const normalizedPartName = scan.partName?.toLowerCase() ?? null;
    const matchedCatalogPart =
      ticket.partsCatalog.find((catalogPart) => {
        const byNumber =
          normalizedPartNumber &&
          catalogPart.partNumber.toLowerCase() === normalizedPartNumber;
        const byName =
          normalizedPartName &&
          catalogPart.name.toLowerCase() === normalizedPartName;
        return Boolean(byNumber || byName);
      }) ?? ticket.partsCatalog[0];

    setParts((previous) => {
      const duplicate = previous.some(
        (part) =>
          part.assetCode.trim().toLowerCase() ===
            scan.assetCode.toLowerCase() &&
          part.tagCode.trim().toLowerCase() ===
            scan.tagCode.toLowerCase(),
      );

      if (duplicate) {
        return previous;
      }

      return [
        ...previous,
        {
          ...createPartSelection(matchedCatalogPart),
          assetCode: scan.assetCode,
          tagCode: scan.tagCode,
        },
      ];
    });

    consumedScannedRowsRef.current.add(rowKey);
    setError(null);
    setMessage(
      `Scanned part ${scan.assetCode} (${scan.tagCode}) added to this completion.`,
    );
  }, [scannedPart.scan, scannedPartBlockingError, ticket.id, ticket.partsCatalog]);

  const canSubmit = useMemo(() => {
    return (
      Boolean(technicianId) &&
      !scannedPartBlockingError &&
      resolutionNotes.trim().length >= 10 &&
      Number.isFinite(Number.parseFloat(laborHours)) &&
      beforePhotos.length +
        afterPhotos.length +
        queuedBeforePhotos.length +
        queuedAfterPhotos.length <=
        10
    );
  }, [
    afterPhotos.length,
    beforePhotos.length,
    laborHours,
    queuedAfterPhotos.length,
    queuedBeforePhotos.length,
    resolutionNotes,
    scannedPartBlockingError,
    technicianId,
  ]);

  const updatePhotoSelection = async (
    slot: "before" | "after",
    files: File[],
  ) => {
    const limitedFiles = files.slice(0, 5);
    const setState = slot === "before" ? setBeforePhotos : setAfterPhotos;
    const setQueued =
      slot === "before" ? setQueuedBeforePhotos : setQueuedAfterPhotos;
    const photoLabel = slot === "before" ? "Before" : "After";

    if (files.length > 5) {
      setState(limitedFiles);
      setError("Upload up to 5 photos per section.");
      return;
    }

    try {
      setError(null);
      await deletePhotosForOwner(ticket.id, slot);
      setQueued([]);

      if (limitedFiles.length === 0) {
        setState([]);
        return;
      }

      if (navigator.onLine) {
        setState(limitedFiles);
        return;
      }

      const queued = await queueFilesForOwner({
        ownerId: ticket.id,
        slot,
        files: limitedFiles,
      });

      setState([]);
      setQueued(queued);
      setMessage(
        `${photoLabel} photos saved offline. Reconnect before marking work complete.`,
      );
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : `Unable to queue ${photoLabel.toLowerCase()} photos.`,
      );
    }
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
          const matched = ticket.partsCatalog.find(
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

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!technicianId) {
      setError("Technician profile is not available for this user.");
      return;
    }

    if (resolutionNotes.trim().length < 10) {
      setError("Resolution notes must be at least 10 characters.");
      return;
    }

    if (scannedPartBlockingError) {
      setError(scannedPartBlockingError);
      return;
    }

    if (beforePhotos.length + afterPhotos.length > 10) {
      setError("Upload up to 10 total before/after photos.");
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Reconnect to submit this completion. Queued photos will upload automatically once you are back online.",
      );
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const [queuedBeforeResult, queuedAfterResult] = await Promise.all([
        prepareQueuedPhotosForSubmission(ticket.id, "before"),
        prepareQueuedPhotosForSubmission(ticket.id, "after"),
      ]);

      if (
        queuedBeforeResult.status === "offline" ||
        queuedAfterResult.status === "offline"
      ) {
        setError("Reconnect to upload queued photos before submitting.");
        return;
      }

      if (
        queuedBeforeResult.status === "pending" ||
        queuedAfterResult.status === "pending"
      ) {
        setError(
          "Queued photos are still uploading. Please wait a moment and try again.",
        );
        return;
      }

      if (
        queuedBeforeResult.status === "failed" ||
        queuedAfterResult.status === "failed"
      ) {
        setError(
          "Some queued photos failed to upload. Re-select them while online and try again.",
        );
        return;
      }

      const [beforePhotoUrls, afterPhotoUrls] = await Promise.all([
        uploadPhotoFiles(beforePhotos),
        uploadPhotoFiles(afterPhotos),
      ]);

      const partUsages = parts
        .map((entry) => {
          const catalogPart = ticket.partsCatalog.find(
            (catalog) => catalog.id === entry.catalogPartId,
          );

          return {
            assetCode: entry.assetCode.trim(),
            tagCode: entry.tagCode.trim() || null,
            usageType: entry.usageType,
            partName: catalogPart?.name ?? "",
            partNumber: catalogPart?.partNumber ?? "",
            unitCost: Number.parseFloat(entry.cost),
            quantity: Math.max(0.001, Number.parseFloat(entry.quantity) || 1),
          };
        })
        .filter(
          (part) =>
            (part.assetCode.length > 0 || Boolean(part.tagCode)) &&
            Number.isFinite(part.unitCost) &&
            part.unitCost >= 0,
        );

      if (ticket.partTraceabilityMode !== "none" && partUsages.length === 0) {
        setError(
          "This model requires traced part usage. Add at least one linked part/kit/pack code.",
        );
        return;
      }

      const response = await fetch(`/api/ticket/${ticket.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicianId,
          resolutionNotes: resolutionNotes.trim(),
          laborHours: Number.parseFloat(laborHours) || 0,
          beforePhotos: [...queuedBeforeResult.urls, ...beforePhotoUrls],
          afterPhotos: [...queuedAfterResult.urls, ...afterPhotoUrls],
          partUsages,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        claimValue?: number;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to complete ticket.");
        return;
      }

      await Promise.all([
        deletePhotosForOwner(ticket.id, "before"),
        deletePhotosForOwner(ticket.id, "after"),
      ]);
      setQueuedBeforePhotos([]);
      setQueuedAfterPhotos([]);
      setMessage(
        `Work marked complete. Claim value estimate: INR ${payload.claimValue ?? 0}.`,
      );
    } catch {
      setError("Network error while submitting completion.");
    } finally {
      setIsSubmitting(false);
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
          <p key={`${file.name}-${file.lastModified}`} className="flex items-center gap-1">
            <Camera className="h-3 w-3" />
            {file.name}
          </p>
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

  return (
    <NfcPublicShell
      title="Technician Completion"
      description="Capture final notes and close the technician workflow from this scan."
      footer="Customer will be prompted to confirm resolution after submission."
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">{ticket.ticketNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          <p>Issue: {ticket.issueDescription}</p>
          <p>Status: {statusLabel(ticket.status)}</p>
          <p>Reported: {formatDate(ticket.reportedAt)}</p>
        </CardContent>
      </Card>

      <p className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <Radio className="h-3.5 w-3.5" />
        {liveTrackingLabel}
      </p>

      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">
            Resolution Notes
          </label>
          <Textarea
            value={resolutionNotes}
            onChange={(event) => setResolutionNotes(event.target.value)}
            className="min-h-24"
            placeholder="Describe the fix and validation details."
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">
            Labor Hours
          </label>
          <Input
            type="number"
            min="0"
            step="0.25"
            value={laborHours}
            onChange={(event) => setLaborHours(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">
            Before Photos (up to 5)
          </label>
          <Input
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
          <label className="text-sm font-medium text-slate-800">
            After Photos (up to 5)
          </label>
          <Input
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
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-800">
                Parts Used
              </label>
              <p className="text-xs text-slate-500">
                Traceability mode: {ticket.partTraceabilityMode} • Small-part mode:{" "}
                {ticket.smallPartTrackingMode}
              </p>
              <p className="text-xs text-slate-500">
                Primary flow: scan generated part tags through `/r/[code]` and
                return using the resolver action links.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() =>
                setParts((previous) => [
                  ...previous,
                  createPartSelection(ticket.partsCatalog[0]),
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Part
            </Button>
          </div>

          {scannedPartBlockingError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {scannedPartBlockingError}
            </p>
          ) : null}

          {scannedPart.scan ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Resolver scan ready: {scannedPart.scan.assetCode} ({scannedPart.scan.tagCode})
            </p>
          ) : null}

          {parts.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              No parts selected.
            </p>
          ) : (
            <div className="space-y-2">
              {parts.map((part) => (
                <div key={part.id} className="rounded-md border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {ticket.partsCatalog.length > 0 ? (
                      <select
                        value={part.catalogPartId}
                        onChange={(event) =>
                          handlePartChange(part.id, {
                            catalogPartId: event.target.value,
                          })
                        }
                        className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                      >
                        {ticket.partsCatalog.map((catalogPart) => (
                          <option key={catalogPart.id} value={catalogPart.id}>
                            {catalogPart.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value="No catalog part selected"
                        readOnly
                        className="text-slate-500"
                      />
                    )}
                    <Input
                      placeholder="Part/kit/pack asset code"
                      value={part.assetCode}
                      onChange={(event) =>
                        handlePartChange(part.id, {
                          assetCode: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      value={part.usageType}
                      onChange={(event) =>
                        handlePartChange(part.id, {
                          usageType: event.target
                            .value as PartSelection["usageType"],
                        })
                      }
                      className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                    >
                      <option value="consumed">Consumed</option>
                      <option value="installed">Installed</option>
                      <option value="returned_unused">Returned Unused</option>
                      <option value="removed">Removed</option>
                    </select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={part.cost}
                      onChange={(event) =>
                        handlePartChange(part.id, { cost: event.target.value })
                      }
                    />
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={part.quantity}
                      onChange={(event) =>
                        handlePartChange(part.id, { quantity: event.target.value })
                      }
                    />
                  </div>
                  <Input
                    className="mt-2"
                    placeholder="Tag code (for unit scan mandatory mode)"
                    value={part.tagCode}
                    onChange={(event) =>
                      handlePartChange(part.id, {
                        tagCode: event.target.value,
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 h-8 gap-1 px-2 text-xs text-rose-600 hover:text-rose-700"
                    onClick={() =>
                      setParts((previous) =>
                        previous.filter((entry) => entry.id !== part.id),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <Button className="h-11 w-full gap-2" type="submit" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Mark Work Complete
        </Button>
      </form>
    </NfcPublicShell>
  );
}

interface TechnicianTicketViewProps {
  ticket: TicketView;
  stickerNumber?: number;
}

function buildStickerUrl(stickerNumber: number | null) {
  if (!stickerNumber) {
    return null;
  }

  return `${getWarrantyAppBaseUrl()}/nfc/${stickerNumber}`;
}

export function TechnicianTicketView({
  ticket,
  stickerNumber,
}: TechnicianTicketViewProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const customerLink = useMemo(() => buildStickerUrl(stickerNumber ?? null), [
    stickerNumber,
  ]);

  const handleCopy = async () => {
    if (!customerLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(customerLink);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  return (
    <NfcPublicShell
      title="Technician Ticket Summary"
      description="This ticket is already in a later workflow stage."
      footer="Use technician dashboard for full timeline and edits."
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">{ticket.ticketNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>Status: {statusLabel(ticket.status)}</p>
          <p>Issue: {ticket.issueDescription}</p>
          <p>Reported: {formatDate(ticket.reportedAt)}</p>
          <p>
            Technician: {ticket.assignedTechnicianName ?? "Not assigned"}
            {ticket.assignedTechnicianPhone
              ? ` (${ticket.assignedTechnicianPhone})`
              : ""}
          </p>
        </CardContent>
      </Card>

      {ticket.status === "pending_confirmation" ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base text-amber-950">
              Waiting for customer confirmation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-amber-900/90">
            <p>
              The customer must scan/tap the sticker and press{" "}
              <span className="font-semibold">Confirm Resolution</span> to close
              the ticket.
            </p>
            {customerLink ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button variant="outline" className="h-11" asChild>
                  <Link href={`/nfc/${stickerNumber}`}>Open customer link</Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-11 gap-2"
                  onClick={() => void handleCopy()}
                >
                  <Copy className="h-4 w-4" />
                  {copyState === "copied"
                    ? "Copied"
                    : copyState === "failed"
                      ? "Copy failed"
                      : "Copy link"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-amber-900/80">
                Tip: Ask the customer to scan the sticker from their own phone
                (signed out).
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </NfcPublicShell>
  );
}

interface ManagerAssetViewProps {
  product: ProductView;
  tickets: TicketView[];
}

export function ManagerAssetView({ product, tickets }: ManagerAssetViewProps) {
  return (
    <NfcPublicShell
      title="Manager Asset View"
      description="Full sticker and service history context for manager roles."
      footer="Includes historical tickets and current lifecycle visibility."
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Product Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            {product.model?.name ?? "Product"}
          </p>
          <p>Model: {product.model?.modelNumber ?? "Not available"}</p>
          <p>Serial: {product.serialNumber ?? "Not available"}</p>
          <p>Warranty: {statusLabel(product.warrantyStatus)}</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <ScanSearch className="h-4 w-4" />
            Ticket History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tickets.length === 0 ? (
            <p className="text-sm text-slate-600">No tickets found.</p>
          ) : (
            tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {ticket.ticketNumber}
                  </p>
                  <Badge variant="outline" className="capitalize">
                    {statusLabel(ticket.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {ticket.issueCategory ?? "General issue"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Reported {formatDate(ticket.reportedAt)}
                </p>
                {ticket.assignedTechnicianName ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600">
                    <Wrench className="h-3.5 w-3.5" />
                    {ticket.assignedTechnicianName}
                  </p>
                ) : null}
                {ticket.etaLabel ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600">
                    <Clock3 className="h-3.5 w-3.5" />
                    ETA: {ticket.etaLabel}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </NfcPublicShell>
  );
}

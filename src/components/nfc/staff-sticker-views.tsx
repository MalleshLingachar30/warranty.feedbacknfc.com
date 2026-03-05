"use client";

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Loader2,
  Plus,
  PlayCircle,
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
import { getWarrantyAppBaseUrl } from "@/lib/warranty-app-url";

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

interface UploadPhotoResponse {
  error?: string;
  urls?: string[];
  url?: string | null;
}

interface PartSelection {
  id: string;
  catalogPartId: string;
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
    cost: String(part?.typicalCost ?? 0),
    quantity: "1",
  };
}

async function uploadPhotos(files: File[]): Promise<string[]> {
  if (files.length === 0) {
    return [];
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("photos", file));

  const response = await fetch("/api/upload/photo", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as UploadPhotoResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to upload photos.");
  }

  const urls = Array.isArray(payload.urls)
    ? payload.urls.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (urls.length > 0) {
    return urls;
  }

  if (typeof payload.url === "string" && payload.url.trim().length > 0) {
    return [payload.url];
  }

  return [];
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

  const canStart = Boolean(technicianId);

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
        setMessage("Marked en route successfully. Customer has been notified.");
      } else {
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
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [laborHours, setLaborHours] = useState("1");
  const [beforePhotos, setBeforePhotos] = useState<File[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);
  const [parts, setParts] = useState<PartSelection[]>(
    ticket.partsCatalog.length > 0
      ? [createPartSelection(ticket.partsCatalog[0])]
      : [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      Boolean(technicianId) &&
      resolutionNotes.trim().length >= 10 &&
      Number.isFinite(Number.parseFloat(laborHours)) &&
      beforePhotos.length + afterPhotos.length <= 10
    );
  }, [afterPhotos.length, beforePhotos.length, laborHours, resolutionNotes, technicianId]);

  const updatePhotoFiles = (
    setState: Dispatch<SetStateAction<File[]>>,
    files: File[],
  ) => {
    if (files.length > 5) {
      setState(files.slice(0, 5));
      setError("Upload up to 5 photos per section.");
      return;
    }

    setError(null);
    setState(files);
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

    if (beforePhotos.length + afterPhotos.length > 10) {
      setError("Upload up to 10 total before/after photos.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const [beforePhotoUrls, afterPhotoUrls] = await Promise.all([
        uploadPhotos(beforePhotos),
        uploadPhotos(afterPhotos),
      ]);

      const partsUsed = parts
        .map((entry) => {
          const catalogPart = ticket.partsCatalog.find(
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

      const response = await fetch(`/api/ticket/${ticket.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicianId,
          resolutionNotes: resolutionNotes.trim(),
          laborHours: Number.parseFloat(laborHours) || 0,
          beforePhotos: beforePhotoUrls,
          afterPhotos: afterPhotoUrls,
          partsUsed,
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

      setMessage(
        `Work marked complete. Claim value estimate: INR ${payload.claimValue ?? 0}.`,
      );
    } catch {
      setError("Network error while submitting completion.");
    } finally {
      setIsSubmitting(false);
    }
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
              updatePhotoFiles(
                setBeforePhotos,
                Array.from(event.target.files ?? []),
              )
            }
          />
          {beforePhotos.length > 0 ? (
            <div className="space-y-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-600">
              {beforePhotos.map((file) => (
                <p key={`before-${file.name}`} className="flex items-center gap-1">
                  <Camera className="h-3 w-3" />
                  {file.name}
                </p>
              ))}
            </div>
          ) : null}
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
              updatePhotoFiles(setAfterPhotos, Array.from(event.target.files ?? []))
            }
          />
          {afterPhotos.length > 0 ? (
            <div className="space-y-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-600">
              {afterPhotos.map((file) => (
                <p key={`after-${file.name}`} className="flex items-center gap-1">
                  <Camera className="h-3 w-3" />
                  {file.name}
                </p>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-800">Parts Used</label>
            {ticket.partsCatalog.length > 0 ? (
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
            ) : null}
          </div>

          {ticket.partsCatalog.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              No part catalog is configured for this product model.
            </p>
          ) : parts.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              No parts selected.
            </p>
          ) : (
            <div className="space-y-2">
              {parts.map((part) => (
                <div key={part.id} className="rounded-md border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                      min="1"
                      step="1"
                      value={part.quantity}
                      onChange={(event) =>
                        handlePartChange(part.id, { quantity: event.target.value })
                      }
                    />
                  </div>
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

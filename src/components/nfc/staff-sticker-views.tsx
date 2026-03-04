"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  PlayCircle,
  Route,
  ScanSearch,
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

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      Boolean(technicianId) &&
      resolutionNotes.trim().length >= 10 &&
      Number.isFinite(Number.parseFloat(laborHours))
    );
  }, [laborHours, resolutionNotes, technicianId]);

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

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/ticket/${ticket.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicianId,
          resolutionNotes: resolutionNotes.trim(),
          laborHours: Number.parseFloat(laborHours) || 0,
          beforePhotos: [],
          afterPhotos: [],
          partsUsed: [],
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
}

export function TechnicianTicketView({ ticket }: TechnicianTicketViewProps) {
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

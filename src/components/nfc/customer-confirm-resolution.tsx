"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCcw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { TicketView } from "@/components/nfc/types";
import { formatDate } from "@/components/nfc/types";

interface CustomerConfirmResolutionProps {
  ticket: TicketView;
}

export function CustomerConfirmResolution({
  ticket,
}: CustomerConfirmResolutionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitAction = async (action: "confirm" | "reopen") => {
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/ticket/${ticket.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to update ticket status.");
        return;
      }

      setMessage(payload.message ?? "Ticket updated successfully.");
    } catch {
      setError("Network error while updating resolution status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NfcPublicShell
      title="Confirm Service Resolution"
      description="Your technician marked this request as completed. Please confirm whether the issue is fully resolved."
      footer="Your confirmation closes the service request and helps improve service quality."
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">{ticket.ticketNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>Issue: {ticket.issueDescription}</p>
          <p>Reported on: {formatDate(ticket.reportedAt)}</p>
          <p>
            Technician: {ticket.assignedTechnicianName ?? "Assigned technician"}
            {ticket.assignedTechnicianPhone
              ? ` (${ticket.assignedTechnicianPhone})`
              : ""}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Resolution Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>{ticket.resolutionNotes ?? "No technician notes provided."}</p>

          <div className="space-y-2">
            <p className="font-medium text-slate-900">Resolution Photos</p>
            {ticket.resolutionPhotos.length === 0 ? (
              <p className="text-slate-500">No photos uploaded.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {ticket.resolutionPhotos.map((photoUrl, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${photoUrl}-${index}`}
                    src={photoUrl}
                    alt={`Resolution photo ${index + 1}`}
                    className="h-24 w-full rounded-md object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-medium text-slate-900">Parts Used</p>
            {ticket.partsUsed.length === 0 ? (
              <p className="text-slate-500">No parts listed.</p>
            ) : (
              <ul className="space-y-1">
                {ticket.partsUsed.map((part, index) => (
                  <li key={`${part.partName ?? "part"}-${index}`}>
                    {part.partName ?? "Part"}
                    {part.partNumber ? ` (${part.partNumber})` : ""}
                    {typeof part.cost === "number" ? ` - INR ${part.cost}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          className="h-11 gap-2 bg-emerald-600 hover:bg-emerald-700"
          disabled={isSubmitting}
          onClick={() => submitAction("confirm")}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirm Resolution
        </Button>
        <Button
          variant="destructive"
          className="h-11 gap-2"
          disabled={isSubmitting}
          onClick={() => submitAction("reopen")}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Issue Not Resolved
        </Button>
      </div>

      <p className="inline-flex items-center gap-2 text-xs text-slate-500">
        <ShieldAlert className="h-4 w-4" />
        If unresolved, the ticket will be reopened for further action.
      </p>
    </NfcPublicShell>
  );
}

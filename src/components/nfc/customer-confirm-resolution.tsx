"use client";

import { type ReactNode, useState } from "react";
import { CheckCircle2, Loader2, RefreshCcw, ShieldAlert, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { TicketView } from "@/components/nfc/types";
import type { NfcLanguage } from "@/lib/nfc-i18n";
import { getNfcCopy } from "@/lib/nfc-i18n";

interface CustomerConfirmResolutionProps {
  ticket: TicketView;
  language: NfcLanguage;
  languageToggle?: ReactNode;
}

export function CustomerConfirmResolution({
  ticket,
  language,
  languageToggle,
}: CustomerConfirmResolutionProps) {
  const copy = getNfcCopy(language);
  const [pendingAction, setPendingAction] = useState<"confirm" | "reopen" | null>(null);
  const [ticketStatus, setTicketStatus] = useState(ticket.status);
  const [serviceRating, setServiceRating] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isClosedForAction = ticketStatus !== "pending_confirmation";
  const installedParts = ticket.partsUsed.filter(
    (part) => part.usageType === "installed",
  );
  const removedParts = ticket.partsUsed.filter(
    (part) => part.usageType === "removed",
  );
  const otherParts = ticket.partsUsed.filter(
    (part) => part.usageType !== "installed" && part.usageType !== "removed",
  );

  const submitAction = async (action: "confirm" | "reopen") => {
    if (pendingAction || isClosedForAction) {
      return;
    }

    if (action === "confirm" && serviceRating === null) {
      setError(copy.customerConfirmResolution.ratingRequiredError);
      setMessage(null);
      return;
    }

    setPendingAction(action);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/ticket/${ticket.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...(action === "confirm" ? { rating: serviceRating } : {}),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? copy.customerConfirmResolution.updateError);
        return;
      }

      setTicketStatus(action === "confirm" ? "resolved" : "reopened");
      setMessage(payload.message ?? copy.customerConfirmResolution.updateSuccess);
    } catch {
      setError(copy.customerConfirmResolution.networkError);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <NfcPublicShell
      title={copy.customerConfirmResolution.title}
      description={copy.customerConfirmResolution.description}
      footer={copy.customerConfirmResolution.footer}
      subtitle={copy.shellSubtitle}
      headerActions={languageToggle}
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">{ticket.ticketNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>
            {copy.customerConfirmResolution.issueLabel}: {ticket.issueDescription}
          </p>
          <p>
            {copy.customerConfirmResolution.reportedOnLabel}:{" "}
            {new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).format(new Date(ticket.reportedAt))}
          </p>
          <p>
            {copy.customerConfirmResolution.technicianLabel}:{" "}
            {ticket.assignedTechnicianName ??
              copy.customerConfirmResolution.assignedTechnician}
            {ticket.assignedTechnicianPhone
              ? ` (${ticket.assignedTechnicianPhone})`
              : ""}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">
            {copy.customerConfirmResolution.resolutionSummary}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>{ticket.resolutionNotes ?? copy.customerConfirmResolution.noNotes}</p>

          <div className="space-y-2">
            <p className="font-medium text-slate-900">
              {copy.customerConfirmResolution.resolutionPhotos}
            </p>
            {ticket.resolutionPhotos.length === 0 ? (
              <p className="text-slate-500">{copy.customerConfirmResolution.noPhotos}</p>
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
            <p className="font-medium text-slate-900">
              Replacement Parts Installed
            </p>
            {installedParts.length === 0 ? (
              <p className="text-slate-500">{copy.customerConfirmResolution.noParts}</p>
            ) : (
              <ul className="space-y-1">
                {installedParts.map((part, index) => (
                  <li key={`${part.partName ?? "part"}-${index}`}>
                    {part.partName ?? "Part"}
                    {part.partNumber ? ` (${part.partNumber})` : ""}
                    {typeof part.quantity === "number" ? ` • Qty ${part.quantity}` : ""}
                    {part.assetCode ? ` • ${part.assetCode}` : ""}
                    {typeof part.cost === "number" ? ` • INR ${part.cost}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-medium text-slate-900">
              Old Parts Collected For Return
            </p>
            {removedParts.length === 0 ? (
              <p className="text-slate-500">No removed parts were recorded.</p>
            ) : (
              <ul className="space-y-1">
                {removedParts.map((part, index) => (
                  <li key={`${part.partName ?? "removed"}-${index}`}>
                    {part.partName ?? "Part"}
                    {part.partNumber ? ` (${part.partNumber})` : ""}
                    {typeof part.quantity === "number" ? ` • Qty ${part.quantity}` : ""}
                    {part.assetCode ? ` • ${part.assetCode}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {otherParts.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-slate-900">
                {copy.customerConfirmResolution.partsUsed}
              </p>
              <ul className="space-y-1">
                {otherParts.map((part, index) => (
                  <li key={`${part.partName ?? "other"}-${index}`}>
                    {part.partName ?? "Part"}
                    {part.partNumber ? ` (${part.partNumber})` : ""}
                    {typeof part.quantity === "number" ? ` • Qty ${part.quantity}` : ""}
                    {part.assetCode ? ` • ${part.assetCode}` : ""}
                    {typeof part.cost === "number" ? ` • INR ${part.cost}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">
            {copy.customerConfirmResolution.serviceRatingLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-700">
            {copy.customerConfirmResolution.serviceRatingHint}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, index) => {
              const value = index + 1;
              const isSelected = serviceRating === value;

              return (
                <button
                  key={value}
                  type="button"
                  className={`flex h-11 items-center justify-center gap-1 rounded-md border text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                  onClick={() => {
                    setServiceRating(value);
                    setError(null);
                  }}
                  disabled={pendingAction !== null || isClosedForAction}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                >
                  <Star
                    className={`h-4 w-4 ${
                      isSelected ? "fill-amber-400 text-amber-500" : "text-slate-400"
                    }`}
                  />
                  <span>{value}</span>
                </button>
              );
            })}
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

      {ticketStatus === "pending_confirmation" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            className="h-11 gap-2 bg-emerald-600 hover:bg-emerald-700"
            disabled={pendingAction !== null}
            onClick={() => submitAction("confirm")}
          >
            {pendingAction === "confirm" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {copy.customerConfirmResolution.confirmResolution}
          </Button>
          <Button
            variant="destructive"
            className="h-11 gap-2"
            disabled={pendingAction !== null}
            onClick={() => submitAction("reopen")}
          >
            {pendingAction === "reopen" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            {copy.customerConfirmResolution.issueNotResolved}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {ticketStatus === "resolved"
            ? "Customer confirmation has been recorded. This service request is now closed."
            : "This ticket has been reopened for further service action."}
        </div>
      )}

      <p className="inline-flex items-center gap-2 text-xs text-slate-500">
        <ShieldAlert className="h-4 w-4" />
        {copy.customerConfirmResolution.unresolvedHint}
      </p>
    </NfcPublicShell>
  );
}

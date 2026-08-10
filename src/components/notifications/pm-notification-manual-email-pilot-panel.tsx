"use client";

import { AlertTriangle, Loader2, MailCheck, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PmNotificationManualEmailPilotResponse } from "@/lib/preventive-maintenance-manual-email-pilot-client";
import { PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP } from "@/lib/preventive-maintenance-manual-email-pilot-policy";
import { cn } from "@/lib/utils";

type PilotSelectionDiagnostics = {
  reviewedCount: number;
  readyCount: number;
  missingRecipientCount: number;
  preferenceSuppressedCount: number;
  otherSuppressedCount: number;
};

type PmNotificationManualEmailPilotPanelProps = {
  selectedCount: number;
  diagnostics: PilotSelectionDiagnostics;
  liveEmailReadiness: {
    status: "disabled" | "incomplete" | "ready";
    missingConfiguration: string[];
  };
  confirmationChecked: boolean;
  isSending: boolean;
  result: PmNotificationManualEmailPilotResponse | null;
  onConfirmationChange: (checked: boolean) => void;
  onSend: () => void;
};

function labelFromSnakeCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function PmNotificationManualEmailPilotPanel({
  selectedCount,
  diagnostics,
  liveEmailReadiness,
  confirmationChecked,
  isSending,
  result,
  onConfirmationChange,
  onSend,
}: PmNotificationManualEmailPilotPanelProps) {
  const everySelectionReviewed =
    selectedCount > 0 && diagnostics.reviewedCount === selectedCount;
  const canSend =
    liveEmailReadiness.status === "ready" &&
    everySelectionReviewed &&
    confirmationChecked &&
    !isSending;

  return (
    <section
      className="overflow-hidden rounded-lg border border-rose-300 bg-white"
      aria-labelledby="pm-manual-pilot-title"
      data-testid="pm-manual-email-pilot-panel"
    >
      <div className="border-b border-rose-200 bg-rose-50 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-700" />
              <h2
                id="pm-manual-pilot-title"
                className="text-xs font-semibold uppercase tracking-wide text-rose-950"
              >
                Manual live email pilot
              </h2>
              <Badge
                variant="outline"
                className="border-rose-300 bg-white text-rose-800"
              >
                Email only · max{" "}
                {PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-rose-900/80">
              Select exact pending notifications below, review their email
              dry-run diagnostics, then explicitly confirm this one manual
              batch. This action never enables the scheduler and cannot send
              SMS.
            </p>
          </div>
          <div className="shrink-0 rounded-md border border-rose-200 bg-white px-3 py-2 text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Reviewed batch
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-slate-950">
              {selectedCount}/
              {PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-5">
            {[
              ["Dry-run reviewed", diagnostics.reviewedCount],
              ["Ready", diagnostics.readyCount],
              ["Missing recipient", diagnostics.missingRecipientCount],
              ["Preference suppressed", diagnostics.preferenceSuppressedCount],
              ["Other suppressed", diagnostics.otherSuppressedCount],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {liveEmailReadiness.status !== "ready" ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Live email pilot is {liveEmailReadiness.status}. Blocking gate:{" "}
                {liveEmailReadiness.status === "disabled"
                  ? "PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED"
                  : liveEmailReadiness.missingConfiguration.join(", ")}
                .
              </span>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-sm text-slate-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rose-500 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-rose-700"
              checked={confirmationChecked}
              onChange={(event) => onConfirmationChange(event.target.checked)}
              disabled={
                selectedCount === 0 ||
                !everySelectionReviewed ||
                liveEmailReadiness.status !== "ready" ||
                isSending
              }
            />
            <span>
              I reviewed these {selectedCount || "selected"} notification
              {selectedCount === 1 ? "" : "s"} and confirm a live Resend email
              pilot now. I understand suppressed or missing recipients will be
              skipped and no SMS will be sent.
            </span>
          </label>
        </div>

        <Button
          type="button"
          className="min-w-48 bg-rose-700 text-white hover:bg-rose-800"
          onClick={onSend}
          disabled={!canSend}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MailCheck className="h-4 w-4" />
          )}
          {isSending
            ? "Sending reviewed batch"
            : `Send ${selectedCount || "selected"} live email${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      {result ? (
        <div
          className="border-t border-emerald-200 bg-emerald-50/70 px-4 py-3"
          role="status"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-950">
            <MailCheck className="h-4 w-4 text-emerald-700" />
            <span className="font-semibold">Manual pilot recorded</span>
            <span>
              {result.sentAttemptCount} sent · {result.skippedAttemptCount}{" "}
              skipped · {result.failedAttemptCount} failed ·{" "}
              {result.providerCallCount} provider calls
            </span>
          </div>
          <p className="mt-1 text-xs text-emerald-800">
            Audit {result.auditId}. Recipients remain masked in this result.
          </p>
          {result.attempts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {result.attempts.map((attempt) => (
                <Badge
                  key={attempt.id}
                  variant="outline"
                  className={cn(
                    "bg-white",
                    attempt.status === "sent"
                      ? "border-emerald-300 text-emerald-800"
                      : attempt.status === "failed" ||
                          attempt.status === "dead_letter"
                        ? "border-rose-300 text-rose-800"
                        : "border-slate-300 text-slate-700",
                  )}
                >
                  {attempt.recipientAddressMasked ?? "Recipient unavailable"} ·{" "}
                  {labelFromSnakeCase(attempt.status)}
                  {attempt.skipReason
                    ? ` · ${labelFromSnakeCase(attempt.skipReason)}`
                    : ""}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

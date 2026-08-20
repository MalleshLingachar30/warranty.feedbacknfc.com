"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PmNotificationDispatchResponse } from "@/lib/preventive-maintenance-notification-dry-run-client";

type PmNotificationDryRunActionProps = {
  runDryRun: () => Promise<PmNotificationDispatchResponse>;
};

export function PmNotificationDryRunAction({
  runDryRun,
}: PmNotificationDryRunActionProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PmNotificationDispatchResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleRunDryRun = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setIsRunning(true);
    setResult(null);
    setError(null);

    try {
      setResult(await runDryRun());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to preview messages.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {result ? (
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[310px]">
          <div className="rounded-md border border-slate-200 px-2 py-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              New
            </p>
            <p className="text-sm font-semibold text-slate-950">
              {result.createdAttemptCount}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 px-2 py-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Existing
            </p>
            <p className="text-sm font-semibold text-slate-950">
              {result.existingAttemptCount}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 px-2 py-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Skipped
            </p>
            <p className="text-sm font-semibold text-slate-950">
              {result.skippedAttemptCount}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <Button
          type="button"
          size="sm"
          onClick={handleRunDryRun}
          disabled={isRunning}
          aria-describedby="pm-delivery-dry-run-feedback"
          data-testid="pm-delivery-dry-run-button"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isRunning ? "Previewing…" : "Preview updates"}
        </Button>

        <div
          id="pm-delivery-dry-run-feedback"
          className="min-h-4 max-w-xl text-xs sm:text-right"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {isRunning ? (
            <p className="text-slate-600">
              Checking which updates are ready to send…
            </p>
          ) : error ? (
            <p className="text-rose-700">{error}</p>
          ) : result ? (
            <p className="text-emerald-700">
              Checked {result.scannedIntentCount} pending update
              {result.scannedIntentCount === 1 ? "" : "s"} and found{" "}
              {result.candidateAttemptCount} message
              {result.candidateAttemptCount === 1 ? "" : "s"} to review.
              {result.missingRecipientCount > 0
                ? ` ${result.missingRecipientCount} missing contact ${result.missingRecipientCount === 1 ? "was" : "s were"} held back.`
                : ""}
              {result.preferenceSuppressedCount > 0
                ? ` ${result.preferenceSuppressedCount} message${result.preferenceSuppressedCount === 1 ? " was" : "s were"} blocked by communication preferences.`
                : ""}
            </p>
          ) : (
            <p className="text-slate-500">
              This only checks readiness; it does not send email or SMS.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

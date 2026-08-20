"use client";

import { Clock3, Mail, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  PreventiveMaintenanceDeliveryAttemptChannel,
  PreventiveMaintenanceDeliveryProviderEventStatus,
  PreventiveMaintenanceDeliveryAttemptStatus,
  SerializedPreventiveMaintenanceDeliveryAttemptForView,
} from "@/lib/preventive-maintenance-delivery-attempts";

type PmDeliveryAttempt = SerializedPreventiveMaintenanceDeliveryAttemptForView;

interface PmDeliveryAttemptSummaryProps {
  attempts: PmDeliveryAttempt[];
  compact?: boolean;
  diagnostics?: boolean;
}

function statusTone(status: PreventiveMaintenanceDeliveryAttemptStatus) {
  switch (status) {
    case "queued":
    case "sending":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "sent":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
    case "dead_letter":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "skipped":
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function channelIcon(channel: PreventiveMaintenanceDeliveryAttemptChannel) {
  if (channel === "sms") {
    return <MessageSquare className="h-3 w-3" />;
  }

  return <Mail className="h-3 w-3" />;
}

function providerStatusTone(
  status: PreventiveMaintenanceDeliveryProviderEventStatus,
) {
  switch (status) {
    case "delivered":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "bounced":
    case "suppressed":
    case "complained":
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "delivery_delayed":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function labelFromSnakeCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function messageStatusLabel(
  status: PreventiveMaintenanceDeliveryAttemptStatus,
) {
  switch (status) {
    case "queued":
      return "Ready";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "dead_letter":
      return "Needs review";
    case "skipped":
      return "Not sent";
    default:
      return labelFromSnakeCase(status);
  }
}

function emailServiceStatusLabel(
  status: PreventiveMaintenanceDeliveryProviderEventStatus,
) {
  switch (status) {
    case "delivery_delayed":
      return "Delayed";
    case "suppressed":
      return "Blocked";
    case "complained":
      return "Complaint reported";
    default:
      return labelFromSnakeCase(status);
  }
}

function skipReasonLabel(reason: string) {
  if (reason === "dry_run") {
    return "Preview only";
  }

  if (reason.includes("missing") || reason.endsWith("_unavailable")) {
    return "Missing contact details";
  }

  if (reason.endsWith("_email_disabled")) {
    return "Blocked by communication preferences";
  }

  if (reason.includes("sms")) {
    return "SMS is not enabled";
  }

  return labelFromSnakeCase(reason);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function deliveryDetail(attempt: PmDeliveryAttempt) {
  if (
    (attempt.status === "failed" || attempt.status === "dead_letter") &&
    attempt.errorMessage
  ) {
    return attempt.status === "dead_letter"
      ? `Needs review: ${attempt.errorMessage}`
      : attempt.errorMessage;
  }

  if (attempt.status === "skipped" && attempt.skipReason) {
    return skipReasonLabel(attempt.skipReason);
  }

  if (attempt.providerEventStatus) {
    const deliveryStatus = `Email service ${emailServiceStatusLabel(
      attempt.providerEventStatus,
    ).toLowerCase()}`;
    return attempt.recipientHygieneRisk
      ? `${deliveryStatus}; contact blocked after a delivery issue`
      : deliveryStatus;
  }

  if (attempt.providerMessageId) {
    return "Email service accepted this message";
  }

  if (!attempt.hasRecipientAddress) {
    return "Missing contact details";
  }

  return null;
}

function DeliveryAttemptBadge({ attempt }: { attempt: PmDeliveryAttempt }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Badge
        variant="outline"
        className={cn("gap-1 capitalize", statusTone(attempt.status))}
      >
        {channelIcon(attempt.channel)}
        {messageStatusLabel(attempt.status)}
      </Badge>
      {attempt.providerEventStatus ? (
        <Badge
          variant="outline"
          className={cn(
            "gap-1",
            providerStatusTone(attempt.providerEventStatus),
          )}
        >
          Email {emailServiceStatusLabel(attempt.providerEventStatus)}
        </Badge>
      ) : null}
      {attempt.dryRun ? (
        <Badge
          variant="outline"
          className="border-slate-200 bg-white text-slate-600"
        >
          Preview only
        </Badge>
      ) : null}
      <span className="text-[11px] font-medium text-slate-500">
        Check #{attempt.attemptNumber}
      </span>
      {attempt.recipientAddressMasked ? (
        <span className="truncate text-[11px] text-slate-500">
          {attempt.recipientAddressMasked}
        </span>
      ) : null}
    </div>
  );
}

export function PmDeliveryAttemptSummary({
  attempts,
  compact = false,
  diagnostics = false,
}: PmDeliveryAttemptSummaryProps) {
  const latestAttempt = attempts[0] ?? null;

  if (!latestAttempt) {
    if (compact) {
      return null;
    }

    return (
      <div className="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
        No communication record yet
      </div>
    );
  }

  if (compact) {
    const detail = deliveryDetail(latestAttempt);

    return (
      <div className="mt-2 min-w-0 space-y-1">
        <DeliveryAttemptBadge attempt={latestAttempt} />
        {detail ? (
          <p className="line-clamp-1 text-[11px] text-slate-500">{detail}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Communication record
        </p>
        <p className="text-[11px] text-slate-500">
          {attempts.length} recent{" "}
          {attempts.length === 1 ? "message check" : "message checks"}
        </p>
      </div>
      <div className="mt-2 space-y-2">
        {attempts.map((attempt) => {
          const detail = deliveryDetail(attempt);

          return (
            <div
              key={attempt.id}
              className="min-w-0 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0"
            >
              <DeliveryAttemptBadge attempt={attempt} />
              {detail ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                  {detail}
                </p>
              ) : null}
              {diagnostics ? (
                <div className="mt-2 grid gap-1.5 rounded-md bg-white px-2 py-2 text-[11px] text-slate-500 md:grid-cols-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Clock3 className="h-3 w-3 shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-600">Created</span>
                    <span className="truncate">
                      {formatDateTime(attempt.createdAt)}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Clock3 className="h-3 w-3 shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-600">Updated</span>
                    <span className="truncate">
                      {formatDateTime(attempt.updatedAt)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-600">
                      Contact:
                    </span>{" "}
                    <span className="truncate">
                      {attempt.recipientAddressMasked ?? "Missing"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-600">
                      Email status:
                    </span>{" "}
                    <span className="truncate">
                      {attempt.providerEventStatus
                        ? emailServiceStatusLabel(attempt.providerEventStatus)
                        : "Waiting for update"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-600">
                      Last service update:
                    </span>{" "}
                    <span className="truncate">
                      {attempt.providerEventAt
                        ? formatDateTime(attempt.providerEventAt)
                        : "Not reported"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-600">
                      Message record:
                    </span>{" "}
                    <span className="truncate">
                      {attempt.providerMessageId ? "Available" : "Not used"}
                    </span>
                  </div>
                  <div className="min-w-0 md:col-span-2">
                    <span className="font-medium text-slate-600">
                      Reason:
                    </span>{" "}
                    <span className="break-words">
                      {detail ?? "No issue recorded"}
                    </span>
                  </div>
                  {attempt.nextRetryAt ? (
                    <div className="min-w-0 md:col-span-2">
                      <span className="font-medium text-slate-600">
                        Next retry:
                      </span>{" "}
                      <span>{formatDateTime(attempt.nextRetryAt)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { PmDeliveryAttempt };

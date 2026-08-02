"use client";

import { Mail, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  PreventiveMaintenanceDeliveryAttemptChannel,
  PreventiveMaintenanceDeliveryAttemptStatus,
  SerializedPreventiveMaintenanceDeliveryAttemptForView,
} from "@/lib/preventive-maintenance-delivery-attempts";

type PmDeliveryAttempt =
  SerializedPreventiveMaintenanceDeliveryAttemptForView;

interface PmDeliveryAttemptSummaryProps {
  attempts: PmDeliveryAttempt[];
  compact?: boolean;
}

function statusTone(status: PreventiveMaintenanceDeliveryAttemptStatus) {
  switch (status) {
    case "queued":
    case "sending":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "sent":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
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

function labelFromSnakeCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deliveryDetail(attempt: PmDeliveryAttempt) {
  if (attempt.status === "failed" && attempt.errorMessage) {
    return attempt.errorMessage;
  }

  if (attempt.status === "skipped" && attempt.skipReason) {
    return labelFromSnakeCase(attempt.skipReason);
  }

  if (attempt.providerMessageId) {
    return `Provider id ${attempt.providerMessageId}`;
  }

  if (!attempt.hasRecipientAddress) {
    return "No recipient address";
  }

  return null;
}

function DeliveryAttemptBadge({ attempt }: { attempt: PmDeliveryAttempt }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Badge
        variant="outline"
        className={cn(
          "gap-1 capitalize",
          statusTone(attempt.status),
        )}
      >
        {channelIcon(attempt.channel)}
        {labelFromSnakeCase(attempt.status)}
      </Badge>
      {attempt.dryRun ? (
        <Badge
          variant="outline"
          className="border-slate-200 bg-white text-slate-600"
        >
          Dry run
        </Badge>
      ) : null}
      <span className="text-[11px] font-medium text-slate-500">
        Attempt #{attempt.attemptNumber}
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
}: PmDeliveryAttemptSummaryProps) {
  const latestAttempt = attempts[0] ?? null;

  if (!latestAttempt) {
    if (compact) {
      return null;
    }

    return (
      <div className="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
        No delivery attempts yet
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
          Delivery
        </p>
        <p className="text-[11px] text-slate-500">
          {attempts.length} recent {attempts.length === 1 ? "attempt" : "attempts"}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { PmDeliveryAttempt };

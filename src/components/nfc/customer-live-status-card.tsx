"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Radio, Timer } from "lucide-react";

import type { TicketLiveTrackingView } from "@/components/nfc/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NfcLanguage } from "@/lib/nfc-i18n";
import { getNfcCopy } from "@/lib/nfc-i18n";

interface CustomerLiveStatusCardProps {
  ticketId: string;
  ticketStatus: string;
  initialTracking: TicketLiveTrackingView | null;
  language: NfcLanguage;
}

const POLLABLE_STATUSES = new Set([
  "assigned",
  "technician_enroute",
  "work_in_progress",
]);

function statusToneClass(customerState: TicketLiveTrackingView["customerState"]) {
  if (customerState === "service_in_progress" || customerState === "technician_arrived") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (customerState === "technician_on_the_way" || customerState === "assigned") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (customerState === "paused") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (customerState === "stopped") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatFreshness(
  copy: ReturnType<typeof getNfcCopy>["customerLiveStatus"],
  freshnessSeconds: number | null,
) {
  if (freshnessSeconds === null || !Number.isFinite(freshnessSeconds)) {
    return "-";
  }

  if (freshnessSeconds < 60) {
    return copy.justNow;
  }

  if (freshnessSeconds < 3600) {
    return `${Math.floor(freshnessSeconds / 60)} ${copy.minutesAgoSuffix}`;
  }

  return `${Math.floor(freshnessSeconds / 3600)} ${copy.hoursAgoSuffix}`;
}

function formatEtaMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  if (value <= 0) {
    return "0 min";
  }

  return `${Math.max(5, Math.round(value / 5) * 5)} min`;
}

function statusText(
  copy: ReturnType<typeof getNfcCopy>["customerLiveStatus"],
  state: TicketLiveTrackingView["customerState"],
) {
  switch (state) {
    case "assigned":
      return copy.assigned;
    case "technician_on_the_way":
      return copy.onTheWay;
    case "technician_arrived":
      return copy.arrived;
    case "service_in_progress":
      return copy.inProgress;
    case "paused":
      return copy.paused;
    case "stopped":
      return copy.stopped;
    default:
      return copy.unavailable;
  }
}

function fallbackText(
  copy: ReturnType<typeof getNfcCopy>["customerLiveStatus"],
  reason: TicketLiveTrackingView["fallbackReason"],
) {
  switch (reason) {
    case "awaiting_acceptance":
      return copy.awaitingAcceptance;
    case "awaiting_location":
      return copy.awaitingLocation;
    case "location_permission_denied":
      return copy.permissionDenied;
    case "offline":
      return copy.offline;
    case "paused":
      return copy.pausedFallback;
    case "stale_updates":
      return copy.staleFallback;
    case "tracking_stopped":
      return copy.stoppedFallback;
    case "live_location_unavailable":
      return copy.unavailableFallback;
    default:
      return null;
  }
}

export function CustomerLiveStatusCard({
  ticketId,
  ticketStatus,
  initialTracking,
  language,
}: CustomerLiveStatusCardProps) {
  const copy = getNfcCopy(language).customerLiveStatus;
  const [tracking, setTracking] = useState<TicketLiveTrackingView | null>(
    initialTracking,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const shouldPoll = useMemo(() => {
    const currentStatus = tracking?.ticketStatus ?? ticketStatus;
    return POLLABLE_STATUSES.has(currentStatus);
  }, [ticketStatus, tracking?.ticketStatus]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    let active = true;

    const refresh = async () => {
      if (!active) {
        return;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      setIsRefreshing(true);

      try {
        const response = await fetch(`/api/ticket/${ticketId}/tracking`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          tracking?: TicketLiveTrackingView;
        };

        if (!response.ok || !payload.tracking || !active) {
          return;
        }

        setTracking(payload.tracking);
      } finally {
        if (active) {
          setIsRefreshing(false);
        }
      }
    };

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [shouldPoll, ticketId]);

  if (!tracking) {
    return null;
  }

  const fallback = fallbackText(copy, tracking.fallbackReason);

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="inline-flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-700" />
            {copy.title}
          </span>
          <Badge variant="outline" className={statusToneClass(tracking.customerState)}>
            {statusText(copy, tracking.customerState)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <p>
            {copy.distanceLabel}: {tracking.distanceBand ?? "-"}
          </p>
          <p>
            {copy.etaLabel}: {formatEtaMinutes(tracking.etaMinutes)}
          </p>
          <p>
            {copy.freshnessLabel}: {formatFreshness(copy, tracking.freshnessSeconds)}
          </p>
        </div>

        {tracking.isStale ? (
          <p className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            <Timer className="h-4 w-4" />
            {copy.stale}
          </p>
        ) : null}

        {fallback ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
            {fallback}
          </p>
        ) : null}

        {isRefreshing ? (
          <p className="inline-flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {copy.refreshing}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

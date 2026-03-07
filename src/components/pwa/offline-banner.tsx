"use client";

import { useEffect, useState } from "react";
import { Upload, WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  getQueueStatus,
  subscribeToPhotoQueue,
  type QueueStatusSummary,
} from "@/lib/photo-queue";

function pendingUploadCount(summary: QueueStatusSummary) {
  return summary.pending + summary.uploading;
}

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [queueStatus, setQueueStatus] = useState<QueueStatusSummary>({
    pending: 0,
    uploading: 0,
    uploaded: 0,
    failed: 0,
  });

  useEffect(() => {
    let active = true;

    const refreshStatus = async () => {
      const nextStatus = await getQueueStatus();
      if (active) {
        setQueueStatus(nextStatus);
      }
    };

    void refreshStatus();

    const unsubscribe = subscribeToPhotoQueue(() => {
      void refreshStatus();
    });

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, 15000);

    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, []);

  const queuedCount = pendingUploadCount(queueStatus);

  if (isOnline && queuedCount === 0) {
    return null;
  }

  return (
    <div
      className={[
        "sticky top-0 z-40 rounded-b-2xl border px-4 py-2 text-sm shadow-sm",
        isOnline
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-red-200 bg-red-50 text-red-900",
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 text-center font-medium">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              You are offline. Photos will be saved locally and uploaded when the
              connection returns.
            </span>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 shrink-0 animate-pulse" />
            <span>
              Uploading {queuedCount} queued photo{queuedCount === 1 ? "" : "s"}.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { processUploadQueue } from "@/lib/photo-queue";

async function syncQueuedPhotos() {
  const summary = await processUploadQueue();

  if (summary.uploadedCount > 0) {
    toast.success(
      summary.uploadedCount === 1
        ? "1 queued photo uploaded."
        : `${summary.uploadedCount} queued photos uploaded.`,
    );
  }

  if (summary.failedCount > 0) {
    toast.warning(
      summary.failedCount === 1
        ? "1 queued photo still needs attention."
        : `${summary.failedCount} queued photos still need attention.`,
    );
  }
}

export function PwaRuntime() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch((error) => {
        console.error("Service worker registration failed", error);
      });
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      void syncQueuedPhotos();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void syncQueuedPhotos();
      }
    };

    if (navigator.onLine) {
      void syncQueuedPhotos();
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

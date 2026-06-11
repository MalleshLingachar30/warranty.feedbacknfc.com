"use client";

import { useEffect, useRef, useState } from "react";

const OFFLINE_CONFIRMATION_DELAY_MS = 1500;
const CONNECTIVITY_TIMEOUT_MS = 2500;
const OFFLINE_RECHECK_MS = 15000;

async function probeAppConnectivity(signal: AbortSignal) {
  const response = await fetch("/api/health", {
    method: "GET",
    cache: "no-store",
    signal,
    headers: {
      "x-feedbacknfc-connectivity-check": "1",
    },
  });

  return response.ok;
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const offlineTimerRef = useRef<number | null>(null);
  const recheckIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    const clearOfflineTimer = () => {
      if (offlineTimerRef.current !== null) {
        window.clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };

    const clearRecheckInterval = () => {
      if (recheckIntervalRef.current !== null) {
        window.clearInterval(recheckIntervalRef.current);
        recheckIntervalRef.current = null;
      }
    };

    const runConnectivityProbe = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, CONNECTIVITY_TIMEOUT_MS);

      try {
        const reachable = await probeAppConnectivity(controller.signal);
        if (!disposed) {
          setIsOnline(reachable);
          if (reachable) {
            clearRecheckInterval();
          }
        }
      } catch {
        if (!disposed) {
          setIsOnline(false);
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const scheduleOfflineConfirmation = () => {
      clearOfflineTimer();
      offlineTimerRef.current = window.setTimeout(() => {
        void runConnectivityProbe();
      }, OFFLINE_CONFIRMATION_DELAY_MS);
    };

    const handleOnline = () => {
      clearOfflineTimer();
      clearRecheckInterval();
      setIsOnline(true);
      void runConnectivityProbe();
    };

    const handleOffline = () => {
      scheduleOfflineConfirmation();
      if (recheckIntervalRef.current === null) {
        recheckIntervalRef.current = window.setInterval(() => {
          void runConnectivityProbe();
        }, OFFLINE_RECHECK_MS);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (typeof navigator !== "undefined" && navigator.onLine) {
      void runConnectivityProbe();
    } else {
      handleOffline();
    }

    return () => {
      disposed = true;
      clearOfflineTimer();
      clearRecheckInterval();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

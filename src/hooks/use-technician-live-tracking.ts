"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useOnlineStatus } from "@/hooks/use-online-status";

type TrackingUiState =
  | "idle"
  | "requesting_permission"
  | "active"
  | "paused"
  | "offline"
  | "permission_denied"
  | "error";

type TrackingAction =
  | "start_tracking"
  | "heartbeat"
  | "arrived"
  | "pause"
  | "resume"
  | "stop";

interface PositionSnapshot {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
}

interface UseTechnicianLiveTrackingInput {
  ticketId: string;
  enabled: boolean;
  phase: "enroute" | "on_site";
}

interface UseTechnicianLiveTrackingResult {
  status: TrackingUiState;
  isSharing: boolean;
  hasPermissionError: boolean;
  lastHeartbeatAt: Date | null;
}

const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_MIN_DISTANCE_METERS = 80;

function distanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(toLatitude - fromLatitude);
  const dLng = toRadians(toLongitude - fromLongitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) *
      Math.cos(toRadians(toLatitude)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function mapPosition(position: GeolocationPosition): PositionSnapshot {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

export function useTechnicianLiveTracking(
  input: UseTechnicianLiveTrackingInput,
): UseTechnicianLiveTrackingResult {
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState<TrackingUiState>(
    input.enabled ? "requesting_permission" : "idle",
  );
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<Date | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastTransmittedRef = useRef<{
    latitude: number;
    longitude: number;
    sentAtMs: number;
  } | null>(null);
  const pauseReasonRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const sendTrackingAction = useCallback(
    async (action: TrackingAction, payload?: PositionSnapshot, pauseReason?: string) => {
      const body: {
        action: TrackingAction;
        location?: PositionSnapshot;
        pauseReason?: string;
      } = {
        action,
      };

      if (payload) {
        body.location = payload;
      }

      if (pauseReason) {
        body.pauseReason = pauseReason;
      }

      await fetch(`/api/ticket/${input.ticketId}/tracking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    },
    [input.ticketId],
  );

  const sendHeartbeat = useCallback(
    async (position: GeolocationPosition) => {
      const snapshot = mapPosition(position);
      const nowMs = Date.now();
      const previous = lastTransmittedRef.current;

      if (previous) {
        const elapsed = nowMs - previous.sentAtMs;
        const moved = distanceMeters(
          previous.latitude,
          previous.longitude,
          snapshot.latitude,
          snapshot.longitude,
        );

        if (elapsed < HEARTBEAT_INTERVAL_MS && moved < HEARTBEAT_MIN_DISTANCE_METERS) {
          return;
        }
      }

      await sendTrackingAction("heartbeat", snapshot);

      lastTransmittedRef.current = {
        latitude: snapshot.latitude,
        longitude: snapshot.longitude,
        sentAtMs: nowMs,
      };

      if (mountedRef.current) {
        setLastHeartbeatAt(new Date(snapshot.capturedAt));
        setStatus(isOnline ? "active" : "offline");
      }
    },
    [isOnline, sendTrackingAction],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!input.enabled) {
      queueMicrotask(() => {
        if (mountedRef.current) {
          setStatus("idle");
        }
      });
      pauseReasonRef.current = null;

      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      return;
    }

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        if (mountedRef.current) {
          setStatus("error");
        }
      });
      void sendTrackingAction("pause", undefined, "unsupported");
      return;
    }

    let active = true;

    const start = async () => {
      setStatus("requesting_permission");

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!active) {
            return;
          }

          const snapshot = mapPosition(position);
          const bootstrapAction =
            input.phase === "on_site" ? "arrived" : "start_tracking";

          void sendTrackingAction(bootstrapAction, snapshot)
            .then(() => {
              lastTransmittedRef.current = {
                latitude: snapshot.latitude,
                longitude: snapshot.longitude,
                sentAtMs: Date.now(),
              };
              pauseReasonRef.current = null;

              if (mountedRef.current) {
                setLastHeartbeatAt(new Date(snapshot.capturedAt));
                setStatus(isOnline ? "active" : "offline");
              }
            })
            .catch(() => {
              if (mountedRef.current) {
                setStatus("error");
              }
            });

          watchIdRef.current = navigator.geolocation.watchPosition(
            (nextPosition) => {
              void sendHeartbeat(nextPosition);
            },
            (error) => {
              if (!mountedRef.current) {
                return;
              }

              if (error.code === error.PERMISSION_DENIED) {
                setStatus("permission_denied");
                pauseReasonRef.current = "permission_denied";
                void sendTrackingAction("pause", undefined, "permission_denied");
                return;
              }

              setStatus(isOnline ? "paused" : "offline");
              pauseReasonRef.current = isOnline ? "location_error" : "offline";
              void sendTrackingAction(
                "pause",
                undefined,
                pauseReasonRef.current,
              );
            },
            {
              enableHighAccuracy: true,
              maximumAge: 10_000,
              timeout: 20_000,
            },
          );
        },
        (error) => {
          if (!mountedRef.current) {
            return;
          }

          if (error.code === error.PERMISSION_DENIED) {
            setStatus("permission_denied");
            pauseReasonRef.current = "permission_denied";
            void sendTrackingAction("pause", undefined, "permission_denied");
            return;
          }

          setStatus(isOnline ? "paused" : "offline");
          pauseReasonRef.current = isOnline ? "location_error" : "offline";
          void sendTrackingAction("pause", undefined, pauseReasonRef.current);
        },
        {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 60_000,
        },
      );
    };

    void start();

    return () => {
      active = false;

      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      const cleanupReason = isOnline ? "foreground_inactive" : "offline";
      pauseReasonRef.current = cleanupReason;
      void sendTrackingAction("pause", undefined, cleanupReason);
    };
  }, [input.enabled, input.phase, isOnline, sendHeartbeat, sendTrackingAction]);

  useEffect(() => {
    if (!input.enabled) {
      return;
    }

    if (!isOnline) {
      if (status !== "permission_denied") {
        queueMicrotask(() => {
          if (mountedRef.current) {
            setStatus("offline");
          }
        });
      }

      if (pauseReasonRef.current !== "offline") {
        pauseReasonRef.current = "offline";
        void sendTrackingAction("pause", undefined, "offline");
      }

      return;
    }

    if (status === "offline") {
      pauseReasonRef.current = null;
      void sendTrackingAction("resume").then(() => {
        if (mountedRef.current) {
          setStatus("active");
        }
      });
    }
  }, [input.enabled, isOnline, sendTrackingAction, status]);

  const isSharing = useMemo(
    () => status === "active" || status === "requesting_permission",
    [status],
  );

  return {
    status,
    isSharing,
    hasPermissionError: status === "permission_denied",
    lastHeartbeatAt,
  };
}

import "server-only";

import {
  Prisma,
  type TicketStatus,
  type TicketLiveTrackingState,
} from "@prisma/client";

import { db } from "@/lib/db";

export const TRACKING_POLLABLE_TICKET_STATUSES: TicketStatus[] = [
  "assigned",
  "technician_enroute",
  "work_in_progress",
];

export const TRACKING_STOP_TICKET_STATUSES: TicketStatus[] = [
  "pending_confirmation",
  "resolved",
  "closed",
  "escalated",
];

const ACCEPTED_SERVICE_STATUSES: TicketStatus[] = [
  "technician_enroute",
  "work_in_progress",
];

const STALE_AFTER_SECONDS = 5 * 60;

type GenericRecord = Record<string, unknown>;

export type TechnicianTrackingAction =
  | "start_tracking"
  | "heartbeat"
  | "arrived"
  | "pause"
  | "resume"
  | "stop";

export type TrackingFallbackReason =
  | "awaiting_acceptance"
  | "awaiting_location"
  | "location_permission_denied"
  | "offline"
  | "paused"
  | "stale_updates"
  | "tracking_stopped"
  | "live_location_unavailable"
  | null;

export type TrackingCustomerState =
  | "assigned"
  | "technician_on_the_way"
  | "technician_arrived"
  | "service_in_progress"
  | "paused"
  | "stopped"
  | "unavailable";

export interface TrackingLocationSample {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: Date;
}

export interface CustomerSafeTrackingPayload {
  ticketId: string;
  ticketStatus: TicketStatus;
  trackingState: TicketLiveTrackingState;
  customerState: TrackingCustomerState;
  distanceKm: number | null;
  distanceBand: string | null;
  etaMinutes: number | null;
  freshnessSeconds: number | null;
  isStale: boolean;
  lastUpdatedAt: string | null;
  fallbackReason: TrackingFallbackReason;
  technician: {
    name: string | null;
    phone: string | null;
  };
}

export const TICKET_LIVE_STATUS_SELECT = {
  id: true,
  ticketId: true,
  technicianId: true,
  state: true,
  serviceAnchorLatitude: true,
  serviceAnchorLongitude: true,
  technicianLatitude: true,
  technicianLongitude: true,
  technicianAccuracyM: true,
  distanceKm: true,
  etaMinutes: true,
  lastUpdatedAt: true,
  startedAt: true,
  arrivedAt: true,
  pausedAt: true,
  stoppedAt: true,
  metadata: true,
} satisfies Prisma.TicketLiveStatusSelect;

export type TicketLiveStatusSnapshot = Prisma.TicketLiveStatusGetPayload<{
  select: typeof TICKET_LIVE_STATUS_SELECT;
}>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): GenericRecord {
  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asNullableDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeLatitude(value: number): number | null {
  if (!Number.isFinite(value) || value < -90 || value > 90) {
    return null;
  }

  return value;
}

function normalizeLongitude(value: number): number | null {
  if (!Number.isFinite(value) || value < -180 || value > 180) {
    return null;
  }

  return value;
}

function toNullableNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return asNumber(value);
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundEtaMinutes(value: number): number {
  const rounded = Math.round(value / 5) * 5;
  return Math.max(5, Math.min(180, rounded));
}

function parseEtaMinutesFromLabel(label: string | null): number | null {
  if (!label) {
    return null;
  }

  const match = label.match(/(\d{1,3})/);
  if (!match || !match[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(5, Math.min(180, parsed));
}

function computeDistanceBand(distanceKm: number | null): string | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return null;
  }

  if (distanceKm < 1) {
    return "<1 km";
  }

  if (distanceKm < 3) {
    return "1-3 km";
  }

  if (distanceKm < 8) {
    return "3-8 km";
  }

  if (distanceKm < 15) {
    return "8-15 km";
  }

  if (distanceKm < 30) {
    return "15-30 km";
  }

  return "30+ km";
}

function haversineDistanceKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRadians(toLatitude - fromLatitude);
  const dLng = toRadians(toLongitude - fromLongitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) *
      Math.cos(toRadians(toLatitude)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function estimateEtaMinutes(distanceKm: number): number {
  const averageSpeedKmPerHour = 28;
  const minutes = (distanceKm / averageSpeedKmPerHour) * 60;
  return roundEtaMinutes(minutes);
}

function readCoordinatePairFromRecord(record: GenericRecord): {
  latitude: number;
  longitude: number;
} | null {
  const rawLatitude = asNumber(
    record.latitude ?? record.lat ?? record.serviceLatitude ?? record.serviceLat,
  );
  const rawLongitude = asNumber(
    record.longitude ??
      record.lng ??
      record.lon ??
      record.serviceLongitude ??
      record.serviceLng,
  );

  if (rawLatitude === null || rawLongitude === null) {
    return null;
  }

  const latitude = normalizeLatitude(rawLatitude);
  const longitude = normalizeLongitude(rawLongitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

export function normalizeTrackingLocationSample(
  value: unknown,
): TrackingLocationSample | null {
  const record = asRecord(value);
  const pair = readCoordinatePairFromRecord(record);

  if (!pair) {
    return null;
  }

  const rawAccuracy = asNumber(
    record.accuracyMeters ?? record.accuracyM ?? record.accuracy,
  );

  return {
    latitude: pair.latitude,
    longitude: pair.longitude,
    accuracyMeters:
      rawAccuracy !== null && rawAccuracy >= 0 ? roundTo(rawAccuracy, 2) : null,
    capturedAt: asNullableDate(record.capturedAt) ?? new Date(),
  };
}

export function extractServiceAnchor(input: {
  ticketMetadata: unknown;
  productInstallationLocation: unknown;
}): { latitude: number; longitude: number } | null {
  const ticketMetadata = asRecord(input.ticketMetadata);
  const liveTracking = asRecord(ticketMetadata.liveTracking);
  const serviceAnchor = asRecord(
    liveTracking.serviceAnchor ?? ticketMetadata.serviceAnchor,
  );

  const fromTicketMetadata = readCoordinatePairFromRecord(serviceAnchor);
  if (fromTicketMetadata) {
    return fromTicketMetadata;
  }

  const installationLocation = asRecord(input.productInstallationLocation);
  return readCoordinatePairFromRecord(installationLocation);
}

function mergeMetadata(
  current: unknown,
  patch: GenericRecord,
): Prisma.InputJsonValue {
  return {
    ...asRecord(current),
    ...patch,
  } as Prisma.InputJsonValue;
}

function canShowTravelMetricsForOwner(status: TicketStatus): boolean {
  return ACCEPTED_SERVICE_STATUSES.includes(status);
}

export function shouldStopTrackingForTicketStatus(status: TicketStatus): boolean {
  return TRACKING_STOP_TICKET_STATUSES.includes(status);
}

function hasPreciseTechnicianLocation(
  row: TicketLiveStatusSnapshot | null | undefined,
): boolean {
  return Boolean(row?.technicianLatitude && row?.technicianLongitude);
}

export async function syncTrackingOnEnroute(input: {
  ticketId: string;
  technicianId: string;
  ticketMetadata: unknown;
  productInstallationLocation: unknown;
  etaMinutesHint?: number | null;
}) {
  const now = new Date();
  const existing = await db.ticketLiveStatus.findUnique({
    where: { ticketId: input.ticketId },
    select: TICKET_LIVE_STATUS_SELECT,
  });

  const anchor =
    (existing?.serviceAnchorLatitude && existing?.serviceAnchorLongitude
      ? {
          latitude: toNullableNumber(existing.serviceAnchorLatitude)!,
          longitude: toNullableNumber(existing.serviceAnchorLongitude)!,
        }
      : null) ??
    extractServiceAnchor({
      ticketMetadata: input.ticketMetadata,
      productInstallationLocation: input.productInstallationLocation,
    });

  const nextState: TicketLiveTrackingState = hasPreciseTechnicianLocation(existing)
    ? "enroute"
    : "waiting_for_location";

  const nextMetadata = mergeMetadata(existing?.metadata, {
    source: "ticket_enroute",
    manualEtaMinutes:
      typeof input.etaMinutesHint === "number" && Number.isFinite(input.etaMinutesHint)
        ? Math.max(5, Math.min(180, Math.floor(input.etaMinutesHint)))
        : undefined,
    lastActionAt: now.toISOString(),
  });

  if (!existing) {
    await db.ticketLiveStatus.create({
      data: {
        ticketId: input.ticketId,
        technicianId: input.technicianId,
        state: nextState,
        serviceAnchorLatitude: anchor?.latitude,
        serviceAnchorLongitude: anchor?.longitude,
        startedAt: now,
        etaMinutes:
          typeof input.etaMinutesHint === "number" && Number.isFinite(input.etaMinutesHint)
            ? Math.max(5, Math.min(180, Math.floor(input.etaMinutesHint)))
            : null,
        metadata: nextMetadata,
      },
    });

    return;
  }

  await db.ticketLiveStatus.update({
    where: { ticketId: input.ticketId },
    data: {
      technicianId: input.technicianId,
      state: nextState,
      pausedAt: null,
      stoppedAt: null,
      startedAt: existing.startedAt ?? now,
      serviceAnchorLatitude:
        existing.serviceAnchorLatitude ?? anchor?.latitude ?? undefined,
      serviceAnchorLongitude:
        existing.serviceAnchorLongitude ?? anchor?.longitude ?? undefined,
      etaMinutes:
        existing.etaMinutes ??
        (typeof input.etaMinutesHint === "number" && Number.isFinite(input.etaMinutesHint)
          ? Math.max(5, Math.min(180, Math.floor(input.etaMinutesHint)))
          : undefined),
      metadata: nextMetadata,
    },
  });
}

export async function syncTrackingOnStart(input: {
  ticketId: string;
  technicianId: string;
  ticketMetadata: unknown;
  productInstallationLocation: unknown;
}) {
  const now = new Date();
  const existing = await db.ticketLiveStatus.findUnique({
    where: { ticketId: input.ticketId },
    select: TICKET_LIVE_STATUS_SELECT,
  });

  const anchor =
    (existing?.serviceAnchorLatitude && existing?.serviceAnchorLongitude
      ? {
          latitude: toNullableNumber(existing.serviceAnchorLatitude)!,
          longitude: toNullableNumber(existing.serviceAnchorLongitude)!,
        }
      : null) ??
    extractServiceAnchor({
      ticketMetadata: input.ticketMetadata,
      productInstallationLocation: input.productInstallationLocation,
    });

  const metadata = mergeMetadata(existing?.metadata, {
    source: "ticket_start",
    lastActionAt: now.toISOString(),
    pauseReason: null,
  });

  if (!existing) {
    await db.ticketLiveStatus.create({
      data: {
        ticketId: input.ticketId,
        technicianId: input.technicianId,
        state: "on_site",
        serviceAnchorLatitude: anchor?.latitude,
        serviceAnchorLongitude: anchor?.longitude,
        distanceKm: 0,
        etaMinutes: 0,
        startedAt: now,
        arrivedAt: now,
        lastUpdatedAt: now,
        metadata,
      },
    });

    return;
  }

  await db.ticketLiveStatus.update({
    where: { ticketId: input.ticketId },
    data: {
      technicianId: input.technicianId,
      state: "on_site",
      distanceKm: 0,
      etaMinutes: 0,
      pausedAt: null,
      stoppedAt: null,
      startedAt: existing.startedAt ?? now,
      arrivedAt: existing.arrivedAt ?? now,
      lastUpdatedAt: now,
      serviceAnchorLatitude:
        existing.serviceAnchorLatitude ?? anchor?.latitude ?? undefined,
      serviceAnchorLongitude:
        existing.serviceAnchorLongitude ?? anchor?.longitude ?? undefined,
      metadata,
    },
  });
}

export async function stopTrackingForTicket(input: {
  ticketId: string;
  reason: string;
  actorRole: string;
  ticketMetadata?: unknown;
  productInstallationLocation?: unknown;
}) {
  const now = new Date();
  const existing = await db.ticketLiveStatus.findUnique({
    where: { ticketId: input.ticketId },
    select: TICKET_LIVE_STATUS_SELECT,
  });

  const metadata = mergeMetadata(existing?.metadata, {
    stopReason: input.reason,
    stoppedAt: now.toISOString(),
    stoppedByRole: input.actorRole,
  });

  if (!existing) {
    const anchor = extractServiceAnchor({
      ticketMetadata: input.ticketMetadata ?? null,
      productInstallationLocation: input.productInstallationLocation ?? null,
    });

    await db.ticketLiveStatus.create({
      data: {
        ticketId: input.ticketId,
        state: "stopped",
        serviceAnchorLatitude: anchor?.latitude,
        serviceAnchorLongitude: anchor?.longitude,
        stoppedAt: now,
        metadata,
      },
    });

    return;
  }

  await db.ticketLiveStatus.update({
    where: { ticketId: input.ticketId },
    data: {
      state: "stopped",
      stoppedAt: now,
      pausedAt: null,
      lastUpdatedAt: now,
      technicianLatitude: null,
      technicianLongitude: null,
      technicianAccuracyM: null,
      distanceKm: null,
      etaMinutes: null,
      metadata,
    },
  });
}

export async function applyTechnicianTrackingAction(input: {
  ticketId: string;
  ticketStatus: TicketStatus;
  technicianId: string;
  ticketMetadata: unknown;
  productInstallationLocation: unknown;
  existingLiveStatus: TicketLiveStatusSnapshot | null;
  action: TechnicianTrackingAction;
  locationSample: TrackingLocationSample | null;
  pauseReason: string | null;
}): Promise<TicketLiveStatusSnapshot | null> {
  if (shouldStopTrackingForTicketStatus(input.ticketStatus)) {
    await stopTrackingForTicket({
      ticketId: input.ticketId,
      reason: `ticket_${input.ticketStatus}`,
      actorRole: "system",
      ticketMetadata: input.ticketMetadata,
      productInstallationLocation: input.productInstallationLocation,
    });

    return db.ticketLiveStatus.findUnique({
      where: { ticketId: input.ticketId },
      select: TICKET_LIVE_STATUS_SELECT,
    });
  }

  if (input.action === "stop") {
    await stopTrackingForTicket({
      ticketId: input.ticketId,
      reason: input.pauseReason ?? "manual_stop",
      actorRole: "technician",
      ticketMetadata: input.ticketMetadata,
      productInstallationLocation: input.productInstallationLocation,
    });

    return db.ticketLiveStatus.findUnique({
      where: { ticketId: input.ticketId },
      select: TICKET_LIVE_STATUS_SELECT,
    });
  }

  const now = input.locationSample?.capturedAt ?? new Date();
  const existing = input.existingLiveStatus;

  const anchor =
    (existing?.serviceAnchorLatitude && existing?.serviceAnchorLongitude
      ? {
          latitude: toNullableNumber(existing.serviceAnchorLatitude)!,
          longitude: toNullableNumber(existing.serviceAnchorLongitude)!,
        }
      : null) ??
    extractServiceAnchor({
      ticketMetadata: input.ticketMetadata,
      productInstallationLocation: input.productInstallationLocation,
    });

  let state: TicketLiveTrackingState = existing?.state ?? "waiting_for_location";
  let distanceKm: number | null =
    toNullableNumber(existing?.distanceKm) ?? null;
  let etaMinutes: number | null = existing?.etaMinutes ?? null;

  const metadataPatch: GenericRecord = {
    lastAction: input.action,
    lastActionAt: now.toISOString(),
  };

  const updateData: Prisma.TicketLiveStatusUncheckedUpdateInput = {
    technicianId: input.technicianId,
    serviceAnchorLatitude:
      existing?.serviceAnchorLatitude ?? anchor?.latitude ?? undefined,
    serviceAnchorLongitude:
      existing?.serviceAnchorLongitude ?? anchor?.longitude ?? undefined,
    startedAt: existing?.startedAt ?? now,
  };

  switch (input.action) {
    case "start_tracking":
    case "resume": {
      if (input.locationSample) {
        const rawDistance =
          anchor === null
            ? null
            : haversineDistanceKm(
                input.locationSample.latitude,
                input.locationSample.longitude,
                anchor.latitude,
                anchor.longitude,
              );

        distanceKm = rawDistance === null ? null : roundTo(rawDistance, 2);
        etaMinutes =
          rawDistance === null
            ? null
            : roundEtaMinutes(estimateEtaMinutes(rawDistance));

        state =
          input.ticketStatus === "work_in_progress" ? "on_site" : "enroute";

        updateData.technicianLatitude = input.locationSample.latitude;
        updateData.technicianLongitude = input.locationSample.longitude;
        updateData.technicianAccuracyM = input.locationSample.accuracyMeters;
        updateData.lastUpdatedAt = input.locationSample.capturedAt;
      } else {
        state =
          input.ticketStatus === "work_in_progress"
            ? "on_site"
            : "waiting_for_location";
      }

      updateData.pausedAt = null;
      updateData.stoppedAt = null;
      metadataPatch.pauseReason = null;
      break;
    }
    case "heartbeat": {
      if (!input.locationSample) {
        throw new Error("Location sample is required for heartbeat updates.");
      }

      const rawDistance =
        anchor === null
          ? null
          : haversineDistanceKm(
              input.locationSample.latitude,
              input.locationSample.longitude,
              anchor.latitude,
              anchor.longitude,
            );

      distanceKm = rawDistance === null ? null : roundTo(rawDistance, 2);
      etaMinutes =
        rawDistance === null ? null : roundEtaMinutes(estimateEtaMinutes(rawDistance));
      state = input.ticketStatus === "work_in_progress" ? "on_site" : "enroute";

      updateData.technicianLatitude = input.locationSample.latitude;
      updateData.technicianLongitude = input.locationSample.longitude;
      updateData.technicianAccuracyM = input.locationSample.accuracyMeters;
      updateData.lastUpdatedAt = input.locationSample.capturedAt;
      updateData.pausedAt = null;
      updateData.stoppedAt = null;
      metadataPatch.pauseReason = null;
      break;
    }
    case "arrived": {
      state = "on_site";
      distanceKm = 0;
      etaMinutes = 0;
      updateData.arrivedAt = existing?.arrivedAt ?? now;
      updateData.lastUpdatedAt = now;
      updateData.pausedAt = null;
      updateData.stoppedAt = null;

      if (input.locationSample) {
        updateData.technicianLatitude = input.locationSample.latitude;
        updateData.technicianLongitude = input.locationSample.longitude;
        updateData.technicianAccuracyM = input.locationSample.accuracyMeters;
        updateData.lastUpdatedAt = input.locationSample.capturedAt;
      }

      metadataPatch.pauseReason = null;
      break;
    }
    case "pause": {
      state = "paused";
      updateData.pausedAt = now;
      metadataPatch.pauseReason =
        input.pauseReason && input.pauseReason.trim().length > 0
          ? input.pauseReason.trim().slice(0, 80)
          : "paused";
      break;
    }
    default:
      break;
  }

  updateData.state = state;
  updateData.distanceKm = distanceKm;
  updateData.etaMinutes = etaMinutes;
  updateData.metadata = mergeMetadata(existing?.metadata, metadataPatch);

  if (!existing) {
    await db.ticketLiveStatus.create({
      data: {
        ticketId: input.ticketId,
        technicianId: input.technicianId,
        state,
        serviceAnchorLatitude: anchor?.latitude,
        serviceAnchorLongitude: anchor?.longitude,
        technicianLatitude: updateData.technicianLatitude as
          | number
          | undefined,
        technicianLongitude: updateData.technicianLongitude as
          | number
          | undefined,
        technicianAccuracyM: updateData.technicianAccuracyM as
          | number
          | null
          | undefined,
        distanceKm,
        etaMinutes,
        lastUpdatedAt: updateData.lastUpdatedAt as Date | undefined,
        startedAt: now,
        arrivedAt: updateData.arrivedAt as Date | null | undefined,
        pausedAt: updateData.pausedAt as Date | null | undefined,
        stoppedAt: null,
        metadata: updateData.metadata as Prisma.InputJsonValue,
      },
    });
  } else {
    await db.ticketLiveStatus.update({
      where: {
        ticketId: input.ticketId,
      },
      data: updateData,
    });
  }

  return db.ticketLiveStatus.findUnique({
    where: { ticketId: input.ticketId },
    select: TICKET_LIVE_STATUS_SELECT,
  });
}

function resolveCustomerState(input: {
  ticketStatus: TicketStatus;
  trackingState: TicketLiveTrackingState;
}): TrackingCustomerState {
  if (input.ticketStatus === "assigned") {
    return "assigned";
  }

  if (input.ticketStatus === "work_in_progress") {
    return "service_in_progress";
  }

  if (input.trackingState === "on_site") {
    return "technician_arrived";
  }

  if (input.trackingState === "enroute" || input.ticketStatus === "technician_enroute") {
    return "technician_on_the_way";
  }

  if (input.trackingState === "paused") {
    return "paused";
  }

  if (input.trackingState === "stopped") {
    return "stopped";
  }

  return "unavailable";
}

export function toCustomerSafeTrackingPayload(input: {
  ticketId: string;
  ticketStatus: TicketStatus;
  ticketEtaLabel: string | null;
  liveStatus: TicketLiveStatusSnapshot | null;
  technicianName: string | null;
  technicianPhone: string | null;
  now?: Date;
  revealTravelMetrics: boolean;
}): CustomerSafeTrackingPayload {
  const now = input.now ?? new Date();

  const metadata = asRecord(input.liveStatus?.metadata);

  const baseTrackingState: TicketLiveTrackingState =
    input.liveStatus?.state ??
    (input.ticketStatus === "assigned"
      ? "inactive"
      : input.ticketStatus === "work_in_progress"
        ? "on_site"
        : "waiting_for_location");

  const trackingState = shouldStopTrackingForTicketStatus(input.ticketStatus)
    ? "stopped"
    : input.ticketStatus === "work_in_progress" && baseTrackingState !== "stopped"
      ? "on_site"
      : baseTrackingState;

  const lastUpdatedAt = input.liveStatus?.lastUpdatedAt ?? null;
  const freshnessSeconds = lastUpdatedAt
    ? Math.max(0, Math.floor((now.getTime() - lastUpdatedAt.getTime()) / 1000))
    : null;
  const isStale =
    freshnessSeconds !== null && Number.isFinite(freshnessSeconds)
      ? freshnessSeconds > STALE_AFTER_SECONDS
      : false;

  let distanceKm =
    input.liveStatus?.distanceKm !== null && input.liveStatus?.distanceKm !== undefined
      ? roundTo(toNullableNumber(input.liveStatus.distanceKm) ?? 0, 1)
      : null;
  let etaMinutes =
    typeof input.liveStatus?.etaMinutes === "number"
      ? input.liveStatus.etaMinutes
      : parseEtaMinutesFromLabel(input.ticketEtaLabel);

  const canRevealMetrics =
    input.revealTravelMetrics && canShowTravelMetricsForOwner(input.ticketStatus);

  if (!canRevealMetrics || trackingState === "paused" || trackingState === "stopped") {
    distanceKm = null;
    etaMinutes = null;
  }

  const distanceBand = distanceKm === null ? null : computeDistanceBand(distanceKm);

  let fallbackReason: TrackingFallbackReason = null;

  if (trackingState === "stopped") {
    fallbackReason = "tracking_stopped";
  } else if (input.ticketStatus === "assigned") {
    fallbackReason = "awaiting_acceptance";
  } else if (trackingState === "paused") {
    const pauseReason = asString(metadata.pauseReason);
    if (pauseReason === "permission_denied") {
      fallbackReason = "location_permission_denied";
    } else if (pauseReason === "offline") {
      fallbackReason = "offline";
    } else {
      fallbackReason = "paused";
    }
  } else if (trackingState === "waiting_for_location") {
    const pauseReason = asString(metadata.pauseReason);
    fallbackReason =
      pauseReason === "permission_denied"
        ? "location_permission_denied"
        : "awaiting_location";
  } else if (isStale) {
    fallbackReason = "stale_updates";
  } else if (distanceKm === null && etaMinutes === null) {
    fallbackReason = "live_location_unavailable";
  }

  return {
    ticketId: input.ticketId,
    ticketStatus: input.ticketStatus,
    trackingState,
    customerState: resolveCustomerState({
      ticketStatus: input.ticketStatus,
      trackingState,
    }),
    distanceKm,
    distanceBand,
    etaMinutes,
    freshnessSeconds,
    isStale,
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    fallbackReason,
    technician: {
      name: input.technicianName,
      phone: input.technicianPhone,
    },
  };
}

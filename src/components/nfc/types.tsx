export const OPEN_TICKET_STATUSES = [
  "reported",
  "awaiting_technician_acceptance",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
] as const;

export type OpenTicketStatus = (typeof OPEN_TICKET_STATUSES)[number];

export interface StickerView {
  id: string;
  stickerNumber: number;
  stickerSerial: string | null;
  status: string;
  stickerType?: "qr_only" | "nfc_qr" | "nfc_only" | null;
  allocatedToOrg?: string | null;
  organizationName?: string | null;
  showSupportPhone?: boolean;
  supportPhone?: string | null;
}

export interface ProductModelView {
  id: string;
  name: string;
  modelNumber: string | null;
  imageUrl: string | null;
  warrantyDurationMonths: number;
  commonIssues: unknown;
}

export interface ProductView {
  id: string;
  stickerId: string;
  organizationId: string;
  productModelId: string;
  serialNumber: string | null;
  warrantyStatus: string;
  warrantyStartDate: Date | string | null;
  warrantyEndDate: Date | string | null;
  installationDate: Date | string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  model: ProductModelView | null;
  organizationName: string | null;
  serviceHistory: TicketView[];
}

export interface TicketTimelineView {
  id: string;
  eventType: string;
  eventDescription: string | null;
  actorName: string | null;
  actorRole: string | null;
  createdAt: Date | string;
}

export interface TicketLiveTrackingView {
  ticketId: string;
  ticketStatus: string;
  trackingState:
    | "inactive"
    | "waiting_for_location"
    | "enroute"
    | "on_site"
    | "paused"
    | "stopped";
  customerState:
    | "awaiting_technician_acceptance"
    | "assigned"
    | "technician_on_the_way"
    | "technician_arrived"
    | "service_in_progress"
    | "paused"
    | "stopped"
    | "unavailable";
  distanceKm: number | null;
  distanceBand: string | null;
  etaMinutes: number | null;
  freshnessSeconds: number | null;
  isStale: boolean;
  lastUpdatedAt: string | null;
  fallbackReason:
    | "awaiting_acceptance"
    | "awaiting_location"
    | "location_permission_denied"
    | "offline"
    | "paused"
    | "stale_updates"
    | "tracking_stopped"
    | "live_location_unavailable"
    | null;
  technician: {
    name: string | null;
    phone: string | null;
  };
}

export interface TicketView {
  id: string;
  organizationId: string;
  ticketNumber: string;
  productId: string;
  stickerId: string;
  reportedByName: string | null;
  reportedByPhone: string;
  issueCategory: string | null;
  issueDescription: string;
  status: string;
  reportedAt: Date | string;
  resolutionNotes: string | null;
  resolutionPhotos: string[];
  partsUsed: Array<{
    partName?: string;
    partNumber?: string;
    cost?: number;
    quantity?: number;
    usageType?: "installed" | "consumed" | "returned_unused" | "removed";
    assetCode?: string | null;
    tagCode?: string | null;
  }>;
  receivedSpareItems: Array<{
    dispatchItemId: string;
    dispatchNumber: string;
    dispatchStatus:
      | "planned"
      | "dispatched"
      | "received_by_technician"
      | "partially_reconciled"
      | "fully_reconciled"
      | "cancelled";
    itemStatus:
      | "planned"
      | "dispatched"
      | "received_by_technician"
      | "installed"
      | "consumed"
      | "returned_unused"
      | "partially_reconciled"
      | "cancelled";
    partName: string;
    partNumber: string;
    quantity: number;
    unitCost: number;
    assetCode: string | null;
    tagCode: string | null;
  }>;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  assignedTechnicianPhone: string | null;
  etaLabel: string | null;
  timeline: TicketTimelineView[];
  partsCatalog: Array<{
    id: string;
    name: string;
    partNumber: string;
    typicalCost: number;
  }>;
  partTraceabilityMode: "none" | "pack_or_kit" | "unit_scan_mandatory";
  smallPartTrackingMode:
    | "individual"
    | "pack_level"
    | "kit_level"
    | "pack_or_kit";
  productSummary?: {
    serialNumber: string | null;
    modelName: string | null;
    modelNumber: string | null;
    imageUrl: string | null;
    manufacturerName: string | null;
  };
  liveTracking: TicketLiveTrackingView | null;
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: Date | string | null | undefined): string {
  const date = toDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function parseCommonIssues(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => (typeof entry === "string" ? entry : ""))
          .filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  }

  return [];
}

export const OPEN_TICKET_STATUSES = [
  "reported",
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
  allocatedToOrg?: string | null;
  organizationName?: string | null;
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

export interface TicketView {
  id: string;
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
  partsUsed: Array<{ partName?: string; partNumber?: string; cost?: number }>;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  assignedTechnicianPhone: string | null;
  etaLabel: string | null;
  timeline: TicketTimelineView[];
  productSummary?: {
    serialNumber: string | null;
    modelName: string | null;
    modelNumber: string | null;
    imageUrl: string | null;
    manufacturerName: string | null;
  };
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

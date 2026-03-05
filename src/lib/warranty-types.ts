export type WarrantyTicketSeverity = "low" | "medium" | "high" | "critical";

export type WarrantyTicketStatus =
  | "reported"
  | "assigned"
  | "technician_enroute"
  | "work_in_progress"
  | "pending_confirmation"
  | "completed"
  | "reopened"
  | "escalated";

export type WarrantyProductStatus =
  | "pending_activation"
  | "active"
  | "expired"
  | "extended"
  | "voided";

export interface WarrantyPartCatalogItem {
  id: string;
  name: string;
  partNumber: string;
  typicalCost: number;
}

export interface WarrantyProductModel {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  modelNumber: string;
  imageUrl: string | null;
  warrantyDurationMonths: number;
  commonIssues: string[];
  requiredSkills: string[];
  partsCatalog: WarrantyPartCatalogItem[];
}

export interface WarrantySticker {
  id: string;
  stickerNumber: number;
  stickerSerial: string;
  status: "unregistered" | "allocated" | "bound" | "activated";
  organizationName: string | null;
  productId: string | null;
}

export interface WarrantyProduct {
  id: string;
  stickerId: string;
  stickerNumber: number;
  organizationId: string;
  organizationName: string;
  productModelId: string;
  serialNumber: string;
  warrantyStatus: WarrantyProductStatus;
  warrantyStartDate: string;
  warrantyEndDate: string;
  installationDate: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  warrantyCertificateUrl?: string | null;
}

export interface WarrantyTechnician {
  id: string;
  name: string;
  phone: string;
  serviceCenterId: string;
  serviceCenterName: string;
  coverageCities: string[];
  skills: string[];
  rating: number;
  activeJobCount: number;
  isAvailable: boolean;
  distanceByCityKm: Record<string, number>;
}

export interface WarrantyTicketTimelineEvent {
  id: string;
  eventType: string;
  eventDescription: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
}

export interface WarrantyTicketPartUsed {
  partName: string;
  partNumber: string;
  cost: number;
}

export interface WarrantyTicket {
  id: string;
  ticketNumber: string;
  productId: string;
  stickerId: string;
  reportedByName: string;
  reportedByPhone: string;
  issueCategory: string;
  issueDescription: string;
  severity: WarrantyTicketSeverity;
  status: WarrantyTicketStatus;
  reportedAt: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  assignedTechnicianPhone: string | null;
  etaLabel: string | null;
  customerPhotos: string[];
  resolutionNotes: string | null;
  resolutionPhotos: string[];
  partsUsed: WarrantyTicketPartUsed[];
  laborHours: number | null;
  aiSuggestedParts: WarrantyPartCatalogItem[];
  claimValue: number;
  technicianStartedAt: string | null;
  technicianCompletedAt: string | null;
  customerRating: number | null;
  timeline: WarrantyTicketTimelineEvent[];
}

export interface WarrantyCreateTicketInput {
  productId: string;
  issueCategory: string;
  issueDescription: string;
  severity: WarrantyTicketSeverity;
  photos: string[];
  customerPhone: string;
  customerName?: string;
}

export interface WarrantyCompleteTicketInput {
  resolutionNotes: string;
  beforePhotos: string[];
  afterPhotos: string[];
  partsUsed: WarrantyTicketPartUsed[];
  laborHours: number;
}

export interface ServiceHistoryItem {
  id: string;
  ticketNumber: string;
  issueCategory: string;
  status: WarrantyTicketStatus;
  reportedAt: string;
  resolutionNotes: string | null;
}

export interface TechnicianJob {
  id: string;
  ticketNumber: string;
  status: WarrantyTicketStatus;
  severity: WarrantyTicketSeverity;
  issueCategory: string;
  issueDescription: string;
  reportedAt: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  productName: string;
  productModelNumber: string;
  productSerialNumber: string;
  customerPhotos: string[];
  resolutionPhotos: string[];
  resolutionNotes: string | null;
  partsUsed: WarrantyTicketPartUsed[];
  partsCatalog: WarrantyPartCatalogItem[];
  aiSuggestedParts: WarrantyPartCatalogItem[];
  serviceHistory: ServiceHistoryItem[];
  technicianStartedAt: string | null;
  technicianCompletedAt: string | null;
  laborHours: number | null;
  claimValue: number;
}

export interface TechnicianPerformanceSummary {
  jobsCompletedThisWeek: number;
  jobsCompletedThisMonth: number;
  averageResolutionTimeHours: number;
  customerRating: number;
  totalClaimsValueGenerated: number;
}

export interface TechnicianJobsResponse {
  technician: {
    id: string;
    name: string;
    phone: string;
    serviceCenterName: string;
  };
  jobs: TechnicianJob[];
  performance: TechnicianPerformanceSummary;
  generatedAt: string;
}

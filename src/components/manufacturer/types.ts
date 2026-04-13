export type TicketStatusTone =
  | "new"
  | "assigned"
  | "in_progress"
  | "awaiting_parts";

export type TicketStatusSummary = {
  status: TicketStatusTone;
  label: string;
  count: number;
};

export type MonthlyWarrantyCostPoint = {
  month: string;
  cost: number;
  claims: number;
};

export type TopIssueRow = {
  model: string;
  issue: string;
  incidents: number;
};

export type ManufacturerOverviewData = {
  activeProductsCount: number;
  openTicketsCount: number;
  pendingClaimsCount: number;
  pendingClaimAmount: number;
  topIssueIncidents: number;
  ticketStatus: TicketStatusSummary[];
  monthlyTrend: MonthlyWarrantyCostPoint[];
  topIssues: TopIssueRow[];
};

export type ManufacturerProductModel = {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  modelNumber: string;
  description: string;
  imageUrl: string;
  warrantyDurationMonths: number;
  totalUnits: number;
  commonIssues: string[];
  requiredSkills: string[];
  activationMode?: ActivationMode;
  installationOwnershipMode?: InstallationOwnershipMode;
  installationRequired?: boolean;
  activationTrigger?: ActivationTrigger;
  customerCreationMode?: CustomerCreationMode;
  allowCartonSaleRegistration?: boolean;
  allowUnitSelfActivation?: boolean;
  partTraceabilityMode?: PartTraceabilityMode;
  smallPartTrackingMode?: SmallPartTrackingMode;
  customerAcknowledgementRequired?: boolean;
  installationChecklistTemplate?: string[];
  commissioningTemplate?: string[];
  requiredPhotoPolicy?: RequiredPhotoPolicy;
  requiredGeoCapture?: boolean;
  defaultInstallerSkillTags?: string[];
  includedKitDefinition?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type StickerInventorySummary = {
  totalAllocated: number;
  totalBound: number;
  totalActivated: number;
  totalAvailable: number;
};

export type AllocationHistoryRow = {
  id: string;
  allocationId: string;
  date: string;
  stickerStart: number;
  stickerEnd: number;
  serialPrefix: string;
  serialStart: number;
  serialEnd: number;
  productModelId: string;
  productModelName: string;
  count: number;
  includeCartonQr: boolean;
};

export type ServiceCenterRow = {
  id: string;
  name: string;
  city: string;
  supportedCategories: string[];
  rating: number;
  totalJobsCompleted: number;
  technicians: Array<{
    id: string;
    name: string;
    skillset: string[];
    jobsCompleted: number;
    rating: number;
  }>;
  performance: {
    avgResolutionHours: number;
    claimAccuracy: number;
    customerSatisfaction: number;
  };
};

export type ClaimStatusType =
  | "auto_generated"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "paid"
  | "disputed"
  | "closed";

export type ClaimDocumentationView = {
  photos: string[];
  beforePhotos: string[];
  afterPhotos: string[];
  timestamps: string[];
  timeline: Array<{
    label: string;
    at: string;
  }>;
  partsUsed: string[];
  partsDetailed: Array<{
    partName: string;
    partNumber: string;
    quantity: number;
    cost: number;
    lineTotal: number;
  }>;
  technicianNotes: string;
  issueCategory: string;
  issueDescription: string;
  issueSeverity: string;
  customer: {
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  };
  product: {
    name: string;
    modelNumber: string | null;
    serialNumber: string | null;
    warrantyStartDate: string | null;
    warrantyEndDate: string | null;
  };
  costBreakdown: {
    partsCost: number;
    laborCost: number;
    laborHours: number;
    totalClaimAmount: number;
    currency: string;
  };
  gpsLocation: string | null;
  claimReportUrl: string | null;
};

export type ClaimQueueRow = {
  id: string;
  claimNumber: string;
  ticketReference: string;
  product: string;
  serviceCenter: string;
  amount: number;
  approvedAmount: number | null;
  status: ClaimStatusType;
  submittedDate: string;
  documentation: ClaimDocumentationView | null;
  rejectionReason: string | null;
  isDemo?: boolean;
};
import type {
  ActivationMode,
  ActivationTrigger,
  CustomerCreationMode,
  InstallationOwnershipMode,
  PartTraceabilityMode,
  RequiredPhotoPolicy,
  SmallPartTrackingMode,
} from "@/lib/manufacturer-policy";

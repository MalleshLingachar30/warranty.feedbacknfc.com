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
  timestamps: string[];
  partsUsed: string[];
  technicianNotes: string;
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
  documentation: ClaimDocumentationView;
  rejectionReason: string | null;
};

export type TechnicianTicketStatus =
  | "reported"
  | "awaiting_technician_acceptance"
  | "assigned"
  | "technician_enroute"
  | "work_in_progress"
  | "pending_confirmation"
  | "resolved"
  | "reopened"
  | "escalated"
  | "closed";

export type TechnicianIssueSeverity = "low" | "medium" | "high" | "critical";

export interface TechnicianPartCatalogItem {
  id: string;
  name: string;
  partNumber: string;
  typicalCost: number;
}

export type TechnicianPartUsageType =
  | "installed"
  | "consumed"
  | "returned_unused"
  | "removed";

export interface TechnicianPartUsed {
  partName: string;
  partNumber: string;
  cost: number;
  quantity: number;
  usageType?: TechnicianPartUsageType;
  assetCode?: string | null;
  tagCode?: string | null;
}

export interface TechnicianReceivedSpareItem {
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
}

export interface TechnicianServiceHistoryItem {
  id: string;
  ticketNumber: string;
  issueCategory: string;
  status: TechnicianTicketStatus;
  reportedAt: string;
  resolutionNotes: string | null;
}

export interface TechnicianJob {
  id: string;
  organizationId: string;
  ticketNumber: string;
  status: TechnicianTicketStatus;
  severity: TechnicianIssueSeverity;
  issueCategory: string;
  issueDescription: string;
  reportedAt: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerPincode: string;
  productName: string;
  productModelNumber: string;
  partTraceabilityMode: "none" | "pack_or_kit" | "unit_scan_mandatory";
  smallPartTrackingMode:
    | "individual"
    | "pack_level"
    | "kit_level"
    | "pack_or_kit";
  productSerialNumber: string;
  customerPhotos: string[];
  resolutionPhotos: string[];
  resolutionNotes: string | null;
  partsUsed: TechnicianPartUsed[];
  receivedSpareItems: TechnicianReceivedSpareItem[];
  partsCatalog: TechnicianPartCatalogItem[];
  aiSuggestedParts: TechnicianPartCatalogItem[];
  serviceHistory: TechnicianServiceHistoryItem[];
  technicianStartedAt: string | null;
  technicianCompletedAt: string | null;
  laborHours: number | null;
  claimValue: number;
}

export interface TechnicianPerformance {
  jobsCompletedThisWeek: number;
  jobsCompletedThisMonth: number;
  averageResolutionTimeHours: number;
  customerRating: number;
  ratedJobsCount: number;
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
  performance: TechnicianPerformance;
  generatedAt: string;
}

export type TechnicianInstallationJobStatus =
  | "pending_assignment"
  | "assigned"
  | "scheduled"
  | "technician_enroute"
  | "on_site"
  | "commissioning"
  | "pending_customer_authorization"
  | "completed"
  | "cancelled"
  | "failed";

export type RequiredPhotoPolicy = {
  requireBeforePhoto: boolean;
  requireAfterPhoto: boolean;
  minimumPhotoCount: number;
};

export interface TechnicianInstallationJob {
  id: string;
  manufacturerOrganizationId: string;
  jobNumber: string;
  status: TechnicianInstallationJobStatus;
  scheduledFor: string | null;
  createdAt: string;
  technicianStartedAt: string | null;
  technicianCompletedAt: string | null;
  activationTriggeredAt: string | null;
  checklistTemplateSnapshot: string[];
  commissioningTemplateSnapshot: string[];
  asset: {
    id: string;
    code: string;
    serialNumber: string;
    lifecycleState: string;
  };
  productModel: {
    name: string;
    modelNumber: string;
    installationOwnershipMode: "manufacturer_only" | "dealer_allowed";
    partTraceabilityMode: "none" | "pack_or_kit" | "unit_scan_mandatory";
    smallPartTrackingMode:
      | "individual"
      | "pack_level"
      | "kit_level"
      | "pack_or_kit";
    requiredGeoCapture: boolean;
    customerAcknowledgementRequired: boolean;
    requiredPhotoPolicy: RequiredPhotoPolicy;
    includedKitDefinition: Record<string, unknown>;
  };
  manufacturerName: string;
  assignedServiceCenterName: string;
  saleRegistration: {
    registeredAt: string;
    dealerName: string | null;
    distributorName: string | null;
  } | null;
  installationReport: {
    id: string;
    submittedAt: string;
    customerName: string;
    customerAuthorizedAt: string | null;
    customerAuthorizedByName: string | null;
    pdfUrl: string;
    authorizationUrl: string;
    submittedByRole:
      | "manufacturer_engineer"
      | "dealer_engineer"
      | "dealer_technician";
  } | null;
  partUsages: Array<{
    id: string;
    usageType: TechnicianPartUsageType;
    quantity: number;
    linkedAt: string;
    usedAssetCode: string;
    usedAssetClass: "spare_part" | "small_part" | "kit" | "pack";
    usedTagCode: string | null;
  }>;
}

export interface TechnicianInstallationJobsResponse {
  technician: {
    id: string;
    name: string;
    phone: string;
    serviceCenterName: string;
  };
  jobs: TechnicianInstallationJob[];
  generatedAt: string;
}

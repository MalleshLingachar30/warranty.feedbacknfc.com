export type InternalServiceOrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  serviceType: string;
  priority: string;
  assetPublicCode: string;
  assetSerialNumber: string | null;
  modelName: string;
  modelNumber: string | null;
  serviceCenterName: string;
  serviceCenterCity: string | null;
  manufacturerName: string;
  assignedTechnicianName: string | null;
  receivedAt: string | null;
};

export type InternalServiceTimelineItem = {
  id: string;
  eventType: string;
  eventDescription: string | null;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
};

export type InternalServicePartUsageItem = {
  id: string;
  usageType: string;
  usedAssetCode: string | null;
  usedTagCode: string | null;
  linkedAt: string;
};

export type InternalServiceOrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  serviceType: string;
  priority: string;
  assignedTechnicianId: string | null;
  initiationSource: string;
  finalDisposition: string | null;
  reportedFault: string | null;
  inwardConditionNotes: string | null;
  diagnosisNotes: string | null;
  resolutionNotes: string | null;
  accessoriesReceived: string[];
  receivedAt: string | null;
  triagedAt: string | null;
  repairStartedAt: string | null;
  qcStartedAt: string | null;
  qcCompletedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  isSaleableAfterService: boolean;
  manufacturerName: string;
  serviceCenterName: string;
  serviceCenterCity: string | null;
  assignedTechnicianName: string | null;
  requestedByName: string | null;
  receivedByName: string | null;
  assetPublicCode: string;
  assetSerialNumber: string | null;
  modelName: string;
  modelNumber: string | null;
  timelineEntries: InternalServiceTimelineItem[];
  partUsages: InternalServicePartUsageItem[];
};

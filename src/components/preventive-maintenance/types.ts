export type PreventiveMaintenanceEventStatus =
  | "due"
  | "overdue"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type PreventiveMaintenanceDisplayStatus =
  | PreventiveMaintenanceEventStatus
  | "due_soon"
  | "upcoming"
  | "overdue";

export type PreventiveMaintenanceEventType =
  | "preventive_maintenance"
  | "calibration";

export type PreventiveMaintenanceCadenceType =
  | "interval_days"
  | "month_offsets"
  | "manual";

export type PreventiveMaintenancePlanStatus = "active" | "inactive";

export type PreventiveMaintenanceProductModelOption = {
  id: string;
  name: string;
  modelNumber: string;
};

export type PreventiveMaintenanceServiceCenterOption = {
  id: string;
  name: string;
  city: string | null;
};

export type PreventiveMaintenanceTechnicianOption = {
  id: string;
  name: string;
  serviceCenterId: string;
  serviceCenterName: string;
};

export type PreventiveMaintenancePlanView = {
  id: string;
  organizationId: string;
  productModelId: string;
  productModel: PreventiveMaintenanceProductModelOption;
  name: string;
  eventType: PreventiveMaintenanceEventType;
  eventTypeLabel: string;
  status: PreventiveMaintenancePlanStatus;
  statusLabel: string;
  cadenceType: PreventiveMaintenanceCadenceType;
  cadenceTypeLabel: string;
  cadenceConfig: unknown;
  dueSoonThresholdDays: number;
  customerAcknowledgementRequired: boolean;
  checklistTemplate: unknown;
  calibrationTemplate: unknown;
  metadata: unknown;
  createdByUser: {
    id: string;
    name: string | null;
    email: string | null;
  };
  eventCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PreventiveMaintenanceTimelineEntryView = {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  eventDescription: string | null;
  actorRole: string | null;
  actorName: string | null;
  metadata: unknown;
  createdAt: string;
};

export type PreventiveMaintenanceEventView = {
  id: string;
  eventNumber: string;
  organizationId: string;
  planId: string | null;
  planName: string | null;
  assetId: string;
  eventType: PreventiveMaintenanceEventType;
  eventTypeLabel: string;
  status: PreventiveMaintenanceEventStatus;
  displayStatus: PreventiveMaintenanceDisplayStatus;
  statusLabel: string;
  dueDate: string;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  customerAcknowledgementRequired: boolean;
  customerAcknowledgedAt: string | null;
  remarks: string | null;
  photoUrls: string[];
  metadata: unknown;
  asset: {
    id: string;
    publicCode: string;
    serialNumber: string | null;
    installationDate: string | null;
    productModel: PreventiveMaintenanceProductModelOption;
    customer: {
      id: string;
      name: string | null;
      phone: string | null;
      email: string | null;
    } | null;
  };
  assignedServiceCenter: {
    id: string;
    name: string;
    city: string | null;
    organizationId: string;
  } | null;
  assignedTechnician: {
    id: string;
    name: string;
    phone: string;
    serviceCenterId: string;
  } | null;
  timeline: PreventiveMaintenanceTimelineEntryView[];
  createdAt: string;
  updatedAt: string;
};

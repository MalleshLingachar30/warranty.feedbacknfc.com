import {
  Prisma,
  type PreventiveMaintenanceCadenceType,
  type PreventiveMaintenanceEventStatus,
  type PreventiveMaintenanceEventType,
  type PreventiveMaintenancePlanStatus,
} from "@prisma/client";

import {
  PREVENTIVE_MAINTENANCE_CADENCE_TYPES,
  PREVENTIVE_MAINTENANCE_EVENT_STATUSES,
  PREVENTIVE_MAINTENANCE_EVENT_TYPES,
  derivePreventiveMaintenanceDisplayStatus,
  formatPreventiveMaintenanceLabel,
} from "@/lib/preventive-maintenance";

export const preventiveMaintenancePlanSelect =
  Prisma.validator<Prisma.PreventiveMaintenancePlanSelect>()({
    id: true,
    organizationId: true,
    productModelId: true,
    name: true,
    eventType: true,
    status: true,
    cadenceType: true,
    cadenceConfig: true,
    dueSoonThresholdDays: true,
    customerAcknowledgementRequired: true,
    checklistTemplate: true,
    calibrationTemplate: true,
    metadata: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
    productModel: {
      select: {
        id: true,
        name: true,
        modelNumber: true,
      },
    },
    createdByUser: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    _count: {
      select: {
        events: true,
      },
    },
  });

export const preventiveMaintenanceEventSelect =
  Prisma.validator<Prisma.PreventiveMaintenanceEventSelect>()({
    id: true,
    eventNumber: true,
    organizationId: true,
    planId: true,
    assetId: true,
    eventType: true,
    status: true,
    dueDate: true,
    scheduledFor: true,
    assignedServiceCenterId: true,
    assignedTechnicianId: true,
    startedAt: true,
    completedAt: true,
    cancelledAt: true,
    cancellationReason: true,
    customerAcknowledgementRequired: true,
    customerAcknowledgedAt: true,
    remarks: true,
    photoUrls: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    plan: {
      select: {
        id: true,
        name: true,
        dueSoonThresholdDays: true,
      },
    },
    asset: {
      select: {
        id: true,
        publicCode: true,
        serialNumber: true,
        installationDate: true,
        productModel: {
          select: {
            id: true,
            name: true,
            modelNumber: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    },
    assignedServiceCenter: {
      select: {
        id: true,
        name: true,
        city: true,
        organizationId: true,
      },
    },
    assignedTechnician: {
      select: {
        id: true,
        name: true,
        phone: true,
        serviceCenterId: true,
      },
    },
  });

export type PreventiveMaintenancePlanRow =
  Prisma.PreventiveMaintenancePlanGetPayload<{
    select: typeof preventiveMaintenancePlanSelect;
  }>;

export type PreventiveMaintenanceEventRow =
  Prisma.PreventiveMaintenanceEventGetPayload<{
    select: typeof preventiveMaintenanceEventSelect;
  }>;

export function serializePreventiveMaintenancePlan(
  plan: PreventiveMaintenancePlanRow,
) {
  return {
    id: plan.id,
    organizationId: plan.organizationId,
    productModelId: plan.productModelId,
    productModel: {
      id: plan.productModel.id,
      name: plan.productModel.name,
      modelNumber: plan.productModel.modelNumber ?? "",
    },
    name: plan.name,
    eventType: plan.eventType,
    eventTypeLabel: formatPreventiveMaintenanceLabel(plan.eventType),
    status: plan.status,
    statusLabel: formatPreventiveMaintenanceLabel(plan.status),
    cadenceType: plan.cadenceType,
    cadenceTypeLabel: formatPreventiveMaintenanceLabel(plan.cadenceType),
    cadenceConfig: plan.cadenceConfig,
    dueSoonThresholdDays: plan.dueSoonThresholdDays,
    customerAcknowledgementRequired: plan.customerAcknowledgementRequired,
    checklistTemplate: plan.checklistTemplate,
    calibrationTemplate: plan.calibrationTemplate,
    metadata: plan.metadata,
    createdByUser: {
      id: plan.createdByUser.id,
      name: plan.createdByUser.name,
      email: plan.createdByUser.email,
    },
    eventCount: plan._count.events,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function serializePreventiveMaintenanceEvent(
  event: PreventiveMaintenanceEventRow,
  now = new Date(),
) {
  const displayStatus = derivePreventiveMaintenanceDisplayStatus(
    {
      status: event.status,
      dueDate: event.dueDate,
      scheduledFor: event.scheduledFor,
      completedAt: event.completedAt,
      cancelledAt: event.cancelledAt,
    },
    now,
    event.plan?.dueSoonThresholdDays ?? 14,
  );

  return {
    id: event.id,
    eventNumber: event.eventNumber,
    organizationId: event.organizationId,
    planId: event.planId,
    planName: event.plan?.name ?? null,
    assetId: event.assetId,
    eventType: event.eventType,
    eventTypeLabel: formatPreventiveMaintenanceLabel(event.eventType),
    status: event.status,
    displayStatus,
    statusLabel: formatPreventiveMaintenanceLabel(displayStatus),
    dueDate: event.dueDate.toISOString(),
    scheduledFor: event.scheduledFor?.toISOString() ?? null,
    startedAt: event.startedAt?.toISOString() ?? null,
    completedAt: event.completedAt?.toISOString() ?? null,
    cancelledAt: event.cancelledAt?.toISOString() ?? null,
    cancellationReason: event.cancellationReason,
    customerAcknowledgementRequired: event.customerAcknowledgementRequired,
    customerAcknowledgedAt: event.customerAcknowledgedAt?.toISOString() ?? null,
    remarks: event.remarks,
    photoUrls: event.photoUrls,
    metadata: event.metadata,
    asset: {
      id: event.asset.id,
      publicCode: event.asset.publicCode,
      serialNumber: event.asset.serialNumber,
      installationDate: event.asset.installationDate?.toISOString() ?? null,
      productModel: {
        id: event.asset.productModel.id,
        name: event.asset.productModel.name,
        modelNumber: event.asset.productModel.modelNumber ?? "",
      },
      customer: event.asset.customer
        ? {
            id: event.asset.customer.id,
            name: event.asset.customer.name,
            phone: event.asset.customer.phone,
            email: event.asset.customer.email,
          }
        : null,
    },
    assignedServiceCenter: event.assignedServiceCenter
      ? {
          id: event.assignedServiceCenter.id,
          name: event.assignedServiceCenter.name,
          city: event.assignedServiceCenter.city,
          organizationId: event.assignedServiceCenter.organizationId,
        }
      : null,
    assignedTechnician: event.assignedTechnician
      ? {
          id: event.assignedTechnician.id,
          name: event.assignedTechnician.name,
          phone: event.assignedTechnician.phone,
          serviceCenterId: event.assignedTechnician.serviceCenterId,
        }
      : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export function asOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

export function asPositiveInteger(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

export function asOptionalDate(value: unknown) {
  const raw = asOptionalString(value);
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function parsePreventiveMaintenanceEventType(value: unknown) {
  return typeof value === "string" &&
    PREVENTIVE_MAINTENANCE_EVENT_TYPES.includes(
      value as PreventiveMaintenanceEventType,
    )
    ? (value as PreventiveMaintenanceEventType)
    : null;
}

export function parsePreventiveMaintenanceCadenceType(value: unknown) {
  return typeof value === "string" &&
    PREVENTIVE_MAINTENANCE_CADENCE_TYPES.includes(
      value as PreventiveMaintenanceCadenceType,
    )
    ? (value as PreventiveMaintenanceCadenceType)
    : null;
}

export function parsePreventiveMaintenancePlanStatus(value: unknown) {
  return value === "active" || value === "inactive"
    ? (value as PreventiveMaintenancePlanStatus)
    : null;
}

export function parsePreventiveMaintenanceEventStatus(value: unknown) {
  return typeof value === "string" &&
    PREVENTIVE_MAINTENANCE_EVENT_STATUSES.includes(
      value as PreventiveMaintenanceEventStatus,
    )
    ? (value as PreventiveMaintenanceEventStatus)
    : null;
}

export function jsonValueOrDefault(
  value: unknown,
  fallback: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
  if (value === undefined || value === null) {
    return fallback;
  }

  return value as Prisma.InputJsonValue;
}

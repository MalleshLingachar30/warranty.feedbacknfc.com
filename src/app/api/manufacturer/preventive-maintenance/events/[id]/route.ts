import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  createPreventiveMaintenanceNotificationIntentsForEvent,
  createPreventiveMaintenanceTimelineEntry,
  formatPreventiveMaintenanceLabel,
} from "@/lib/preventive-maintenance";
import {
  asOptionalDate,
  asOptionalString,
  parsePreventiveMaintenanceEventStatus,
  preventiveMaintenanceEventSelect,
  serializePreventiveMaintenanceEvent,
} from "@/lib/preventive-maintenance-api";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../../_utils";

export const runtime = "nodejs";

type PreventiveMaintenanceEventActionPayload = {
  assignedServiceCenterId?: unknown;
  assignedTechnicianId?: unknown;
  scheduledFor?: unknown;
  status?: unknown;
  cancellationReason?: unknown;
};

function hasField<T extends object>(body: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function parseNullableDateField(value: unknown) {
  if (value === null) {
    return null;
  }

  const date = asOptionalDate(value);
  if (!date) {
    throw new ApiError("scheduledFor must be a valid date or null.", 400);
  }

  return date;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId, dbUserId } = await requireManufacturerContext();
    const { id } = await params;
    const body = parseJsonBody<PreventiveMaintenanceEventActionPayload>(
      await request.json(),
    );

    if (!id) {
      throw new ApiError("Preventive maintenance event id is required.", 400);
    }

    const event = await db.preventiveMaintenanceEvent.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        status: true,
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
        scheduledFor: true,
      },
    });

    if (!event) {
      throw new ApiError("Preventive maintenance event not found.", 404);
    }

    if (event.status === "completed" || event.status === "cancelled") {
      throw new ApiError(
        "Completed or cancelled preventive maintenance events cannot be updated.",
        409,
      );
    }

    const requestedStatus = parsePreventiveMaintenanceEventStatus(body.status);
    if (body.status !== undefined && requestedStatus !== "cancelled") {
      throw new ApiError(
        "Only status=cancelled is supported by this endpoint.",
        400,
      );
    }

    const isCancellation = requestedStatus === "cancelled";
    const cancellationReason = asOptionalString(body.cancellationReason);
    if (isCancellation && !cancellationReason) {
      throw new ApiError(
        "cancellationReason is required when cancelling.",
        400,
      );
    }

    if (event.status === "in_progress" && !isCancellation) {
      throw new ApiError(
        "In-progress preventive maintenance events cannot be reassigned or rescheduled.",
        409,
      );
    }

    const assignedServiceCenterId = hasField(body, "assignedServiceCenterId")
      ? asOptionalString(body.assignedServiceCenterId)
      : event.assignedServiceCenterId;
    const assignedTechnicianId = hasField(body, "assignedTechnicianId")
      ? asOptionalString(body.assignedTechnicianId)
      : event.assignedTechnicianId;
    const scheduledFor = hasField(body, "scheduledFor")
      ? parseNullableDateField(body.scheduledFor)
      : undefined;

    let resolvedServiceCenterId = assignedServiceCenterId;

    if (assignedServiceCenterId) {
      const serviceCenter = await db.serviceCenter.findFirst({
        where: {
          id: assignedServiceCenterId,
          OR: [
            {
              manufacturerAuthorizations: {
                has: organizationId,
              },
            },
            {
              organizationId,
            },
          ],
        },
        select: {
          id: true,
        },
      });

      if (!serviceCenter) {
        throw new ApiError("Assigned service center is not authorized.", 400);
      }
    }

    if (assignedTechnicianId) {
      const technician = await db.technician.findFirst({
        where: {
          id: assignedTechnicianId,
          serviceCenter: {
            OR: [
              {
                manufacturerAuthorizations: {
                  has: organizationId,
                },
              },
              {
                organizationId,
              },
            ],
          },
        },
        select: {
          id: true,
          serviceCenterId: true,
        },
      });

      if (!technician) {
        throw new ApiError("Assigned technician is not authorized.", 400);
      }

      if (
        assignedServiceCenterId &&
        technician.serviceCenterId !== assignedServiceCenterId
      ) {
        throw new ApiError(
          "Assigned technician does not belong to the selected service center.",
          400,
        );
      }

      resolvedServiceCenterId =
        assignedServiceCenterId ?? technician.serviceCenterId;
    }

    const nextScheduledFor = scheduledFor === undefined
      ? event.scheduledFor
      : scheduledFor;
    const nextStatus =
      isCancellation
        ? "cancelled"
        : resolvedServiceCenterId || assignedTechnicianId || nextScheduledFor
          ? "scheduled"
          : "due";
    const eventType = isCancellation
      ? "cancelled"
      : event.assignedTechnicianId &&
          assignedTechnicianId &&
          event.assignedTechnicianId !== assignedTechnicianId
        ? "reassigned"
        : "scheduled";
    const eventDescription = isCancellation
      ? `Preventive maintenance cancelled: ${cancellationReason}.`
      : `${formatPreventiveMaintenanceLabel(eventType)} preventive maintenance event.`;

    const updateData: Prisma.PreventiveMaintenanceEventUncheckedUpdateInput =
      isCancellation
        ? {
            status: "cancelled",
            cancelledAt: new Date(),
            cancellationReason,
          }
        : {
            assignedServiceCenterId: resolvedServiceCenterId,
            assignedTechnicianId,
            scheduledFor,
            status: nextStatus,
          };

    const updated = await db.$transaction(async (tx) => {
      const updatedEvent = await tx.preventiveMaintenanceEvent.update({
        where: {
          id: event.id,
        },
        data: updateData,
        select: preventiveMaintenanceEventSelect,
      });

      await createPreventiveMaintenanceTimelineEntry({
        tx,
        eventId: event.id,
        eventType,
        eventDescription,
        actorUserId: dbUserId,
        actorRole: "manufacturer_admin",
        actorName: "Manufacturer Admin",
        metadata: {
          previousStatus: event.status,
          nextStatus,
          previousAssignedServiceCenterId: event.assignedServiceCenterId,
          nextAssignedServiceCenterId: resolvedServiceCenterId,
          previousAssignedTechnicianId: event.assignedTechnicianId,
          nextAssignedTechnicianId: assignedTechnicianId,
          previousScheduledFor: event.scheduledFor?.toISOString() ?? null,
          nextScheduledFor: nextScheduledFor?.toISOString() ?? null,
          cancellationReason: cancellationReason ?? null,
        } as Prisma.InputJsonValue,
      });

      await createPreventiveMaintenanceNotificationIntentsForEvent({
        tx,
        eventId: event.id,
        triggerType: eventType,
        metadata: {
          actorRole: "manufacturer_admin",
          actorUserId: dbUserId,
        },
      });

      return tx.preventiveMaintenanceEvent.findUniqueOrThrow({
        where: {
          id: updatedEvent.id,
        },
        select: preventiveMaintenanceEventSelect,
      });
    });

    return NextResponse.json({
      event: serializePreventiveMaintenanceEvent(updated),
    });
  } catch (error) {
    return jsonError(error);
  }
}

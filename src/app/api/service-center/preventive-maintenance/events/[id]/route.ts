import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
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
  requireServiceCenterContext,
} from "../../../_utils";

export const runtime = "nodejs";

type PreventiveMaintenanceServiceCenterActionPayload = {
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
    const { organizationId } = await requireServiceCenterContext();
    const { id } = await params;
    const body = parseJsonBody<PreventiveMaintenanceServiceCenterActionPayload>(
      await request.json(),
    );

    if (!id) {
      throw new ApiError("Preventive maintenance event id is required.", 400);
    }

    const event = await db.preventiveMaintenanceEvent.findFirst({
      where: {
        id,
        assignedServiceCenter: {
          organizationId,
        },
      },
      select: {
        id: true,
        status: true,
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
      },
    });

    if (!event) {
      throw new ApiError(
        "Preventive maintenance event not found for this service center.",
        404,
      );
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

    const assignedTechnicianId = hasField(body, "assignedTechnicianId")
      ? asOptionalString(body.assignedTechnicianId)
      : event.assignedTechnicianId;
    const scheduledFor = hasField(body, "scheduledFor")
      ? parseNullableDateField(body.scheduledFor)
      : undefined;

    if (assignedTechnicianId) {
      const technician = await db.technician.findFirst({
        where: {
          id: assignedTechnicianId,
          serviceCenterId: event.assignedServiceCenterId ?? undefined,
          serviceCenter: {
            organizationId,
          },
        },
        select: {
          id: true,
        },
      });

      if (!technician) {
        throw new ApiError(
          "Assigned technician does not belong to this service center.",
          400,
        );
      }
    }

    const updateData: Prisma.PreventiveMaintenanceEventUncheckedUpdateInput =
      isCancellation
        ? {
            status: "cancelled",
            cancelledAt: new Date(),
            cancellationReason,
          }
        : {
            assignedTechnicianId,
            scheduledFor,
            status: assignedTechnicianId || scheduledFor ? "scheduled" : "due",
          };

    const updated = await db.preventiveMaintenanceEvent.update({
      where: {
        id: event.id,
      },
      data: updateData,
      select: preventiveMaintenanceEventSelect,
    });

    return NextResponse.json({
      event: serializePreventiveMaintenanceEvent(updated),
    });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../_utils";

type UpdateManufacturerTicketPayload = {
  assignedServiceCenterId?: unknown;
  assignedTechnicianId?: unknown;
};

function parseOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<UpdateManufacturerTicketPayload>(
      await request.json(),
    );
    const { id } = await params;

    const assignedServiceCenterId = parseOptionalString(body.assignedServiceCenterId);
    const assignedTechnicianId = parseOptionalString(body.assignedTechnicianId);

    if (!assignedServiceCenterId || !assignedTechnicianId) {
      throw new ApiError(
        "assignedServiceCenterId and assignedTechnicianId are required.",
        400,
      );
    }

    const ticket = await db.ticket.findFirst({
      where: {
        id,
        product: {
          organizationId,
        },
      },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
      },
    });

    if (!ticket) {
      throw new ApiError("Ticket not found.", 404);
    }

    if (ticket.status === "resolved" || ticket.status === "closed") {
      throw new ApiError("Resolved or closed tickets cannot be reassigned.", 409);
    }

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
        name: true,
      },
    });

    if (!serviceCenter) {
      throw new ApiError("Assigned service center is not authorized.", 400);
    }

    const technician = await db.technician.findFirst({
      where: {
        id: assignedTechnicianId,
        serviceCenterId: assignedServiceCenterId,
      },
      select: {
        id: true,
        name: true,
        isAvailable: true,
        activeJobCount: true,
        maxConcurrentJobs: true,
      },
    });

    if (!technician) {
      throw new ApiError(
        "Assigned technician does not belong to the selected service center.",
        400,
      );
    }

    const isReassigningTechnician =
      ticket.assignedTechnicianId !== null &&
      ticket.assignedTechnicianId !== technician.id;

    const isNewTechnicianAssignment = ticket.assignedTechnicianId !== technician.id;
    const isAtCapacity =
      technician.maxConcurrentJobs > 0 &&
      technician.activeJobCount >= technician.maxConcurrentJobs;

    if ((isAtCapacity || !technician.isAvailable) && isNewTechnicianAssignment) {
      throw new ApiError(
        "Selected technician is currently unavailable for assignment.",
        409,
      );
    }

    await db.$transaction(async (tx) => {
      await tx.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          status: "awaiting_technician_acceptance",
          assignedServiceCenterId,
          assignedTechnicianId: technician.id,
          assignmentMethod: "manual",
          assignmentNotes: `Manual manufacturer assignment to ${technician.name} (${serviceCenter.name}).`,
          assignedAt: new Date(),
          escalationReason: null,
          escalatedAt: null,
        },
      });

      if (ticket.assignedTechnicianId && isReassigningTechnician) {
        await tx.technician.update({
          where: {
            id: ticket.assignedTechnicianId,
          },
          data: {
            activeJobCount: {
              decrement: 1,
            },
          },
        });
      }

      if (isNewTechnicianAssignment) {
        await tx.technician.update({
          where: {
            id: technician.id,
          },
          data: {
            activeJobCount: {
              increment: 1,
            },
          },
        });
      }

      await tx.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "awaiting_technician_acceptance",
          eventDescription: `Manufacturer manually assigned this job to ${technician.name} from ${serviceCenter.name}. Waiting for technician acceptance.`,
          actorRole: "manufacturer_admin",
          actorName: "Manufacturer Workspace Admin",
        },
      });
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}

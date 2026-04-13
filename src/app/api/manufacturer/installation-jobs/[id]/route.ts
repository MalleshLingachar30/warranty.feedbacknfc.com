import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  installationJobLifecycleState,
  parseOptionalDate,
  parseOptionalString,
} from "@/lib/installation-workflow";
import {
  installationJobSelect,
  serializeInstallationJobRow,
} from "@/lib/installation-workflow-view";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../_utils";

type UpdateInstallationJobPayload = {
  assignedServiceCenterId?: unknown;
  assignedTechnicianId?: unknown;
  scheduledFor?: unknown;
  status?: unknown;
};

function parseStatus(value: unknown) {
  switch (value) {
    case "pending_assignment":
    case "assigned":
    case "scheduled":
    case "cancelled":
    case "failed":
      return value;
    default:
      return null;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<UpdateInstallationJobPayload>(
      await request.json(),
    );
    const { id } = await params;

    const job = await db.installationJob.findFirst({
      where: {
        id,
        manufacturerOrgId: organizationId,
      },
      select: {
        id: true,
        assetId: true,
        status: true,
      },
    });

    if (!job) {
      throw new ApiError("Installation job not found.", 404);
    }

    const assignedServiceCenterId = parseOptionalString(
      body.assignedServiceCenterId,
    );
    const assignedTechnicianId = parseOptionalString(body.assignedTechnicianId);
    const scheduledFor = parseOptionalDate(body.scheduledFor);
    const explicitStatus = parseStatus(body.status);

    const technician = assignedTechnicianId
      ? await db.technician.findFirst({
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
        })
      : null;

    if (assignedTechnicianId && !technician) {
      throw new ApiError("Assigned technician is not authorized.", 400);
    }

    const resolvedServiceCenterId =
      assignedServiceCenterId ?? technician?.serviceCenterId ?? null;

    if (
      assignedServiceCenterId &&
      technician &&
      technician.serviceCenterId !== assignedServiceCenterId
    ) {
      throw new ApiError(
        "Assigned technician does not belong to the selected service center.",
        400,
      );
    }

    if (resolvedServiceCenterId) {
      const center = await db.serviceCenter.findFirst({
        where: {
          id: resolvedServiceCenterId,
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

      if (!center) {
        throw new ApiError("Assigned service center is not authorized.", 400);
      }
    }

    const nextStatus =
      explicitStatus ??
      (job.status === "technician_enroute" ||
      job.status === "on_site" ||
      job.status === "commissioning" ||
      job.status === "completed"
        ? job.status
        : scheduledFor
          ? "scheduled"
          : resolvedServiceCenterId
            ? "assigned"
            : "pending_assignment");

    const updated = await db.$transaction(async (tx) => {
      const nextJob = await tx.installationJob.update({
        where: {
          id,
        },
        data: {
          assignedServiceCenterId: resolvedServiceCenterId,
          assignedTechnicianId: technician?.id ?? null,
          scheduledFor,
          status: nextStatus,
        },
        select: installationJobSelect,
      });

      await tx.assetIdentity.update({
        where: {
          id: job.assetId,
        },
        data: {
          lifecycleState: installationJobLifecycleState(nextStatus),
        },
      });

      return nextJob;
    });

    return NextResponse.json({
      job: serializeInstallationJobRow(updated),
    });
  } catch (error) {
    return jsonError(error);
  }
}

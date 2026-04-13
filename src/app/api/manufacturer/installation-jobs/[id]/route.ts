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
      },
    });

    if (!job) {
      throw new ApiError("Installation job not found.", 404);
    }

    const assignedServiceCenterId = parseOptionalString(
      body.assignedServiceCenterId,
    );
    const scheduledFor = parseOptionalDate(body.scheduledFor);
    const explicitStatus = parseStatus(body.status);

    if (assignedServiceCenterId) {
      const center = await db.serviceCenter.findFirst({
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

      if (!center) {
        throw new ApiError("Assigned service center is not authorized.", 400);
      }
    }

    const nextStatus =
      explicitStatus ??
      (scheduledFor
        ? "scheduled"
        : assignedServiceCenterId
          ? "assigned"
          : "pending_assignment");

    const updated = await db.$transaction(async (tx) => {
      const nextJob = await tx.installationJob.update({
        where: {
          id,
        },
        data: {
          assignedServiceCenterId,
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

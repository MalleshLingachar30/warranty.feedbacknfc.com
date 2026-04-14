import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { installationJobLifecycleState } from "@/lib/installation-workflow";
import {
  installationJobSelect,
  serializeInstallationJobRow,
} from "@/lib/installation-workflow-view";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "../../_utils";

export const runtime = "nodejs";

type AssignInstallationTechnicianPayload = {
  assignedTechnicianId?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canDispatchFromStatus(status: string) {
  return (
    status === "pending_assignment" ||
    status === "assigned" ||
    status === "scheduled"
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireServiceCenterContext();
    const body = parseJsonBody<AssignInstallationTechnicianPayload>(
      await request.json(),
    );
    const { id } = await params;

    const assignedTechnicianId = asString(body.assignedTechnicianId);

    if (!assignedTechnicianId) {
      throw new ApiError("assignedTechnicianId is required.", 400);
    }

    const job = await db.installationJob.findFirst({
      where: {
        id,
        assignedServiceCenter: {
          organizationId,
        },
      },
      select: {
        id: true,
        assetId: true,
        status: true,
        scheduledFor: true,
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
      },
    });

    if (!job) {
      throw new ApiError(
        "Installation job not found for this service-center organization.",
        404,
      );
    }

    if (!job.assignedServiceCenterId) {
      throw new ApiError(
        "Installation job has not been assigned to a service center.",
        409,
      );
    }

    if (
      job.status === "completed" ||
      job.status === "cancelled" ||
      job.status === "failed"
    ) {
      throw new ApiError(
        "Completed or closed installation jobs cannot be reassigned.",
        409,
      );
    }

    if (!canDispatchFromStatus(job.status)) {
      throw new ApiError(
        `Cannot reassign technician while job is ${job.status}.`,
        409,
      );
    }

    const technician = await db.technician.findFirst({
      where: {
        id: assignedTechnicianId,
        serviceCenterId: job.assignedServiceCenterId,
        serviceCenter: {
          organizationId,
        },
      },
      select: {
        id: true,
        isAvailable: true,
        activeJobCount: true,
        maxConcurrentJobs: true,
      },
    });

    if (!technician) {
      throw new ApiError(
        "Selected technician does not belong to this assigned service center.",
        403,
      );
    }

    const isAtCapacity =
      technician.activeJobCount >= technician.maxConcurrentJobs;
    if (
      (isAtCapacity || !technician.isAvailable) &&
      technician.id !== job.assignedTechnicianId
    ) {
      throw new ApiError(
        "Selected technician is currently unavailable for dispatch.",
        409,
      );
    }

    const nextStatus =
      job.status === "pending_assignment"
        ? job.scheduledFor
          ? "scheduled"
          : "assigned"
        : job.status;

    const updated = await db.$transaction(async (tx) => {
      const nextJob = await tx.installationJob.update({
        where: {
          id: job.id,
        },
        data: {
          assignedTechnicianId: technician.id,
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

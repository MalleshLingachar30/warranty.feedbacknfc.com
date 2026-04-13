import { NextResponse } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { installationJobLifecycleState } from "@/lib/installation-workflow";
import {
  installationJobSelect,
  serializeInstallationJobRow,
} from "@/lib/installation-workflow-view";
import { clerkOrDbHasRole } from "@/lib/rbac";

export const runtime = "nodejs";

type UpdateStatusPayload = {
  status?: unknown;
};

function parseStatus(value: unknown) {
  switch (value) {
    case "technician_enroute":
    case "on_site":
    case "commissioning":
      return value;
    default:
      return null;
  }
}

function canTransition(input: {
  currentStatus: string;
  nextStatus: "technician_enroute" | "on_site" | "commissioning";
}) {
  if (input.currentStatus === input.nextStatus) {
    return true;
  }

  if (input.nextStatus === "technician_enroute") {
    return (
      input.currentStatus === "assigned" || input.currentStatus === "scheduled"
    );
  }

  if (input.nextStatus === "on_site") {
    return input.currentStatus === "technician_enroute";
  }

  return input.currentStatus === "on_site";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authData = await getOptionalAuth();

    if (!authData.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleGuardDisabled =
      process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true";

    if (!roleGuardDisabled) {
      const hasRequiredRole = await clerkOrDbHasRole({
        clerkUserId: authData.userId,
        orgRole: authData.orgRole,
        sessionClaims: authData.sessionClaims,
        requiredRole: "technician",
      });

      if (!hasRequiredRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = (await request.json().catch(() => ({}))) as UpdateStatusPayload;
    const nextStatus = parseStatus(body.status);

    if (!nextStatus) {
      return NextResponse.json(
        {
          error:
            "status is required and must be one of: technician_enroute, on_site, commissioning.",
        },
        { status: 400 },
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Installation job id is required." },
        { status: 400 },
      );
    }

    const technician = await db.technician.findFirst({
      where: {
        user: {
          clerkId: authData.userId,
        },
      },
      select: {
        id: true,
        serviceCenterId: true,
      },
    });

    if (!technician) {
      return NextResponse.json(
        {
          error:
            "No technician profile found for this account. Ask your service center admin to add you.",
        },
        { status: 400 },
      );
    }

    const job = await db.installationJob.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        assetId: true,
        technicianStartedAt: true,
        assignedTechnicianId: true,
        assignedServiceCenterId: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Installation job not found." },
        { status: 404 },
      );
    }

    if (
      job.assignedTechnicianId &&
      job.assignedTechnicianId !== technician.id
    ) {
      return NextResponse.json(
        { error: "Installation job is assigned to another technician." },
        { status: 403 },
      );
    }

    if (
      job.assignedServiceCenterId &&
      job.assignedServiceCenterId !== technician.serviceCenterId
    ) {
      return NextResponse.json(
        { error: "Technician does not belong to the assigned service center." },
        { status: 403 },
      );
    }

    if (
      job.status === "completed" ||
      job.status === "cancelled" ||
      job.status === "failed"
    ) {
      return NextResponse.json(
        { error: "Completed or closed installation jobs cannot be updated." },
        { status: 409 },
      );
    }

    if (
      !canTransition({
        currentStatus: job.status,
        nextStatus,
      })
    ) {
      return NextResponse.json(
        {
          error: `Cannot move installation job from ${job.status} to ${nextStatus}.`,
        },
        { status: 409 },
      );
    }

    const startedAt =
      nextStatus === "on_site" || nextStatus === "commissioning"
        ? job.technicianStartedAt ?? new Date()
        : job.technicianStartedAt;

    const updated = await db.$transaction(async (tx) => {
      const nextJob = await tx.installationJob.update({
        where: {
          id: job.id,
        },
        data: {
          assignedServiceCenterId:
            job.assignedServiceCenterId ?? technician.serviceCenterId,
          assignedTechnicianId: technician.id,
          status: nextStatus,
          technicianStartedAt: startedAt,
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
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update installation status.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

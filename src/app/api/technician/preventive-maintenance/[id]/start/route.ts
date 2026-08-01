import { NextResponse, type NextRequest } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import {
  createPreventiveMaintenanceNotificationIntentsForEvent,
  createPreventiveMaintenanceTimelineEntry,
} from "@/lib/preventive-maintenance";
import { clerkOrDbHasRole } from "@/lib/rbac";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
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
        requiredRole: "field_technician",
      });

      if (!hasRequiredRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { id: eventId } = await context.params;

    if (!eventId) {
      return NextResponse.json(
        { error: "Preventive maintenance event id is required." },
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
        userId: true,
        name: true,
        serviceCenterId: true,
      },
    });

    if (!technician) {
      return NextResponse.json(
        {
          error:
            "Technician profile not found for this account. Ask your service center admin to add you.",
        },
        { status: 400 },
      );
    }

    const event = await db.preventiveMaintenanceEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        eventNumber: true,
        status: true,
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
        startedAt: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Preventive maintenance event not found." },
        { status: 404 },
      );
    }

    if (
      event.status !== "due" &&
      event.status !== "overdue" &&
      event.status !== "scheduled" &&
      event.status !== "in_progress"
    ) {
      return NextResponse.json(
        {
          error:
            "Preventive maintenance cannot be started from the current status.",
        },
        { status: 409 },
      );
    }

    if (
      event.assignedTechnicianId &&
      event.assignedTechnicianId !== technician.id
    ) {
      return NextResponse.json(
        { error: "Preventive maintenance is assigned to another technician." },
        { status: 403 },
      );
    }

    if (
      event.assignedServiceCenterId &&
      event.assignedServiceCenterId !== technician.serviceCenterId
    ) {
      return NextResponse.json(
        {
          error:
            "Technician does not belong to the assigned service center.",
        },
        { status: 403 },
      );
    }

    const startedAt = event.startedAt ?? new Date();
    const shouldIncrementLoad = !event.startedAt;

    await db.$transaction(
      async (tx) => {
        await tx.preventiveMaintenanceEvent.update({
          where: {
            id: event.id,
          },
          data: {
            status: "in_progress",
            assignedTechnicianId: technician.id,
            assignedServiceCenterId:
              event.assignedServiceCenterId ?? technician.serviceCenterId,
            startedAt,
          },
        });

        if (shouldIncrementLoad) {
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

        await createPreventiveMaintenanceTimelineEntry({
          tx,
          eventId: event.id,
          eventType: "started",
          eventDescription: "Technician started preventive maintenance.",
          actorUserId: technician.userId,
          actorRole: "field_technician",
          actorName: technician.name,
          metadata: {
            previousStatus: event.status,
            nextStatus: "in_progress",
            previousAssignedServiceCenterId: event.assignedServiceCenterId,
            nextAssignedServiceCenterId:
              event.assignedServiceCenterId ?? technician.serviceCenterId,
            previousAssignedTechnicianId: event.assignedTechnicianId,
            nextAssignedTechnicianId: technician.id,
            startedAt: startedAt.toISOString(),
          },
        });

        await createPreventiveMaintenanceNotificationIntentsForEvent({
          tx,
          eventId: event.id,
          triggerType: "started",
          metadata: {
            actorRole: "field_technician",
            actorUserId: technician.userId,
            actorName: technician.name,
          },
        });
      },
      {
        timeout: 15_000,
      },
    );

    return NextResponse.json({
      success: true,
      eventId: event.id,
      eventNumber: event.eventNumber,
      status: "in_progress",
      startedAt: startedAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start preventive maintenance";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

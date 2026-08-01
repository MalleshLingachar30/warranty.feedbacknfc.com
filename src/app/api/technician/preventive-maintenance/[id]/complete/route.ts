import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import {
  createPreventiveMaintenanceNotificationIntentsForEvent,
  createPreventiveMaintenanceTimelineEntry,
} from "@/lib/preventive-maintenance";
import { clerkOrDbHasRole } from "@/lib/rbac";

export const runtime = "nodejs";

const MAX_PHOTO_COUNT = 10;

type CompletePreventiveMaintenanceRequest = {
  remarks?: unknown;
  checklistCompleted?: unknown;
  calibrationReadings?: unknown;
  photoUrls?: unknown;
};

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function metadataAsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function validateChecklist(input: {
  template: string[];
  completed: string[];
}) {
  const completed = new Set(input.completed);
  const missing = input.template.filter((item) => !completed.has(item));

  if (missing.length > 0) {
    throw new Error("Complete every preventive maintenance checklist item.");
  }
}

export async function POST(
  request: NextRequest,
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
    const body = (await request.json()) as CompletePreventiveMaintenanceRequest;

    if (!eventId) {
      return NextResponse.json(
        { error: "Preventive maintenance event id is required." },
        { status: 400 },
      );
    }

    const remarks = asNonEmptyString(body.remarks);
    if (!remarks || remarks.length < 10) {
      return NextResponse.json(
        { error: "Remarks must be at least 10 characters." },
        { status: 400 },
      );
    }

    const photoUrls = sanitizeStringArray(body.photoUrls).slice(
      0,
      MAX_PHOTO_COUNT,
    );
    if (sanitizeStringArray(body.photoUrls).length > MAX_PHOTO_COUNT) {
      return NextResponse.json(
        { error: `Upload a maximum of ${MAX_PHOTO_COUNT} photos.` },
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
        activeJobCount: true,
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
        checklistTemplateSnapshot: true,
        calibrationTemplateSnapshot: true,
        metadata: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Preventive maintenance event not found." },
        { status: 404 },
      );
    }

    if (event.status !== "in_progress") {
      return NextResponse.json(
        { error: "Only in-progress preventive maintenance can be completed." },
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

    const checklistTemplate = sanitizeStringArray(
      event.checklistTemplateSnapshot,
    );
    const checklistCompleted = sanitizeStringArray(body.checklistCompleted);
    validateChecklist({
      template: checklistTemplate,
      completed: checklistCompleted,
    });

    const completedAt = new Date();
    const metadata = metadataAsObject(event.metadata);
    const calibrationReadings =
      body.calibrationReadings === undefined
        ? []
        : (body.calibrationReadings as Prisma.InputJsonValue);

    await db.$transaction(async (tx) => {
      await tx.preventiveMaintenanceEvent.update({
        where: {
          id: event.id,
        },
        data: {
          status: "completed",
          assignedTechnicianId: technician.id,
          assignedServiceCenterId:
            event.assignedServiceCenterId ?? technician.serviceCenterId,
          startedAt: event.startedAt ?? completedAt,
          completedAt,
          remarks,
          photoUrls,
          checklistResponses: checklistCompleted,
          calibrationReadings,
          metadata: {
            ...metadata,
            completedByTechnicianId: technician.id,
            completedByTechnicianName: technician.name,
            completedVia: "technician_dashboard",
          },
        },
      });

      if (technician.activeJobCount > 0) {
        await tx.technician.update({
          where: {
            id: technician.id,
          },
          data: {
            activeJobCount: {
              decrement: 1,
            },
          },
        });
      }

      await createPreventiveMaintenanceTimelineEntry({
        tx,
        eventId: event.id,
        eventType: "completed",
        eventDescription: "Technician completed preventive maintenance.",
        actorUserId: technician.userId,
        actorRole: "field_technician",
        actorName: technician.name,
        metadata: {
          previousStatus: event.status,
          nextStatus: "completed",
          previousAssignedServiceCenterId: event.assignedServiceCenterId,
          nextAssignedServiceCenterId:
            event.assignedServiceCenterId ?? technician.serviceCenterId,
          previousAssignedTechnicianId: event.assignedTechnicianId,
          nextAssignedTechnicianId: technician.id,
          startedAt: (event.startedAt ?? completedAt).toISOString(),
          completedAt: completedAt.toISOString(),
          checklistCompletedCount: checklistCompleted.length,
          photoCount: photoUrls.length,
        },
      });

      await createPreventiveMaintenanceNotificationIntentsForEvent({
        tx,
        eventId: event.id,
        triggerType: "completed",
        metadata: {
          actorRole: "field_technician",
          actorUserId: technician.userId,
          actorName: technician.name,
        },
      });
    });

    return NextResponse.json({
      success: true,
      eventId: event.id,
      eventNumber: event.eventNumber,
      status: "completed",
      completedAt: completedAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete preventive maintenance";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  PreventiveMaintenanceNotificationApiError,
  preventiveMaintenanceNotificationSelect,
  resolvePreventiveMaintenanceNotificationAudience,
  serializePreventiveMaintenanceNotification,
} from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

type NotificationActionPayload = {
  action?: unknown;
};

function jsonError(error: unknown) {
  if (error instanceof PreventiveMaintenanceNotificationApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

function parseBody(value: unknown): NotificationActionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Invalid JSON body.",
      400,
    );
  }

  return value as NotificationActionPayload;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const { id } = await params;
    const body = parseBody(await request.json().catch(() => null));

    if (!id) {
      throw new PreventiveMaintenanceNotificationApiError(
        "Notification id is required.",
        400,
      );
    }

    if (body.action !== "dismiss") {
      throw new PreventiveMaintenanceNotificationApiError(
        "Only action=dismiss is supported.",
        400,
      );
    }

    const visibleNotification =
      await db.preventiveMaintenanceNotificationIntent.findFirst({
        where: {
          id,
          ...audience.where,
        },
        select: {
          id: true,
        },
      });

    if (!visibleNotification) {
      throw new PreventiveMaintenanceNotificationApiError(
        "Notification not found.",
        404,
      );
    }

    const notification = await db.preventiveMaintenanceNotificationIntent.update({
      where: {
        id: visibleNotification.id,
      },
      data: {
        status: "dismissed",
      },
      select: preventiveMaintenanceNotificationSelect,
    });

    return NextResponse.json({
      notification: serializePreventiveMaintenanceNotification(notification),
    });
  } catch (error) {
    return jsonError(error);
  }
}

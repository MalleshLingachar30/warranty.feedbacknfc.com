import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  parsePreventiveMaintenanceNotificationLimit,
  parsePreventiveMaintenanceNotificationStatus,
  PreventiveMaintenanceNotificationApiError,
  preventiveMaintenanceNotificationSelect,
  resolvePreventiveMaintenanceNotificationAudience,
  serializePreventiveMaintenanceNotification,
} from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status");
    const status =
      requestedStatus === "all"
        ? null
        : parsePreventiveMaintenanceNotificationStatus(requestedStatus) ??
          "pending";
    const limit = parsePreventiveMaintenanceNotificationLimit(
      url.searchParams.get("limit"),
    );

    const where = {
      ...audience.where,
      ...(status ? { status } : {}),
    };

    const [notifications, pendingCount] = await Promise.all([
      db.preventiveMaintenanceNotificationIntent.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        select: preventiveMaintenanceNotificationSelect,
      }),
      db.preventiveMaintenanceNotificationIntent.count({
        where: {
          ...audience.where,
          status: "pending",
        },
      }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((notification) =>
        serializePreventiveMaintenanceNotification(notification),
      ),
      pendingCount,
    });
  } catch (error) {
    return jsonError(error);
  }
}

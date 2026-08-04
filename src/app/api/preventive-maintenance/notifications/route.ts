import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPreventiveMaintenanceEmailDeliveryReadiness } from "@/lib/preventive-maintenance-email-delivery";
import { canDispatchPreventiveMaintenanceNotifications } from "@/lib/preventive-maintenance-notification-dispatch";
import {
  getPreventiveMaintenanceNotificationLastDryRunSummary,
  parsePreventiveMaintenanceNotificationLimit,
  parsePreventiveMaintenanceNotificationStatus,
  parsePreventiveMaintenanceNotificationTrigger,
  PreventiveMaintenanceNotificationApiError,
  preventiveMaintenanceNotificationSelect,
  resolvePreventiveMaintenanceNotificationAudience,
  serializePreventiveMaintenanceNotification,
} from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

type BulkNotificationActionPayload = {
  action?: unknown;
  status?: unknown;
  triggerType?: unknown;
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

function parseBody(value: unknown): BulkNotificationActionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Invalid JSON body.",
      400,
    );
  }

  return value as BulkNotificationActionPayload;
}

export async function GET(request: Request) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status");
    const status =
      requestedStatus === "all"
        ? null
        : (parsePreventiveMaintenanceNotificationStatus(requestedStatus) ??
          "pending");
    const triggerType = parsePreventiveMaintenanceNotificationTrigger(
      url.searchParams.get("triggerType"),
    );
    const limit = parsePreventiveMaintenanceNotificationLimit(
      url.searchParams.get("limit"),
    );

    const where = {
      ...audience.where,
      ...(status ? { status } : {}),
      ...(triggerType ? { triggerType } : {}),
    };
    const deliveryReadiness = canDispatchPreventiveMaintenanceNotifications(
      audience.role,
    )
      ? getPreventiveMaintenanceEmailDeliveryReadiness()
      : null;

    const [
      notifications,
      pendingCount,
      filteredCount,
      filteredPendingCount,
      dismissedCount,
      deliveredCount,
      cancelledCount,
      lastDryRun,
    ] = await Promise.all([
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
      db.preventiveMaintenanceNotificationIntent.count({
        where,
      }),
      db.preventiveMaintenanceNotificationIntent.count({
        where: {
          ...audience.where,
          status: "pending",
          ...(triggerType ? { triggerType } : {}),
        },
      }),
      db.preventiveMaintenanceNotificationIntent.count({
        where: {
          ...audience.where,
          status: "dismissed",
          ...(triggerType ? { triggerType } : {}),
        },
      }),
      db.preventiveMaintenanceNotificationIntent.count({
        where: {
          ...audience.where,
          status: "delivered",
          ...(triggerType ? { triggerType } : {}),
        },
      }),
      db.preventiveMaintenanceNotificationIntent.count({
        where: {
          ...audience.where,
          status: "cancelled",
          ...(triggerType ? { triggerType } : {}),
        },
      }),
      getPreventiveMaintenanceNotificationLastDryRunSummary(where),
    ]);

    return NextResponse.json({
      notifications: notifications.map((notification) =>
        serializePreventiveMaintenanceNotification(notification),
      ),
      pendingCount,
      filteredCount,
      statusCounts: {
        pending: filteredPendingCount,
        delivered: deliveredCount,
        dismissed: dismissedCount,
        cancelled: cancelledCount,
      },
      lastDryRun,
      deliveryReadiness,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const body = parseBody(await request.json().catch(() => null));

    if (body.action !== "dismiss_all") {
      throw new PreventiveMaintenanceNotificationApiError(
        "Only action=dismiss_all is supported.",
        400,
      );
    }

    const requestedStatus =
      typeof body.status === "string" ? body.status : "pending";
    const status =
      requestedStatus === "all"
        ? null
        : parsePreventiveMaintenanceNotificationStatus(requestedStatus);
    const triggerType = parsePreventiveMaintenanceNotificationTrigger(
      body.triggerType,
    );

    if (requestedStatus !== "all" && !status) {
      throw new PreventiveMaintenanceNotificationApiError(
        "Invalid notification status filter.",
        400,
      );
    }

    const where = {
      ...audience.where,
      status: status ?? "pending",
      ...(triggerType ? { triggerType } : {}),
    };

    const result = await db.preventiveMaintenanceNotificationIntent.updateMany({
      where,
      data: {
        status: "dismissed",
      },
    });

    return NextResponse.json({
      dismissedCount: result.count,
    });
  } catch (error) {
    return jsonError(error);
  }
}

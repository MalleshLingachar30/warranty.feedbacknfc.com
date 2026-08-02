import { NextResponse } from "next/server";

import {
  dispatchPreventiveMaintenanceNotifications,
  parsePreventiveMaintenanceDispatchChannels,
  parsePreventiveMaintenanceDispatchLimit,
} from "@/lib/preventive-maintenance-notification-dispatch";
import {
  parsePreventiveMaintenanceNotificationTrigger,
  PreventiveMaintenanceNotificationApiError,
  resolvePreventiveMaintenanceNotificationAudience,
} from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

type DispatchPayload = {
  dryRun?: unknown;
  channels?: unknown;
  limit?: unknown;
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

function parseBody(value: unknown): DispatchPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Invalid JSON body.",
      400,
    );
  }

  return value as DispatchPayload;
}

export async function POST(request: Request) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const body = parseBody(await request.json().catch(() => null));

    const dryRun = body.dryRun !== false;
    const channels = parsePreventiveMaintenanceDispatchChannels(body.channels);
    const triggerType = parsePreventiveMaintenanceNotificationTrigger(
      body.triggerType,
    );
    const limit = parsePreventiveMaintenanceDispatchLimit(body.limit);

    const result = await dispatchPreventiveMaintenanceNotifications({
      audience,
      channels,
      triggerType,
      limit,
      dryRun,
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

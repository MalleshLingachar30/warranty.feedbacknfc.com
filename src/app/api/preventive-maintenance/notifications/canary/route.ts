import { NextResponse } from "next/server";

import { sendPreventiveMaintenanceEmailCanary } from "@/lib/preventive-maintenance-email-canary";
import {
  PreventiveMaintenanceNotificationApiError,
  resolvePreventiveMaintenanceNotificationAudience,
} from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

type CanaryPayload = {
  confirmLiveCanary?: unknown;
};

function parseBody(value: unknown): CanaryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Invalid JSON body.",
      400,
    );
  }

  return value as CanaryPayload;
}

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

export async function POST(request: Request) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const body = parseBody(await request.json().catch(() => null));
    const result = await sendPreventiveMaintenanceEmailCanary({
      audience,
      confirmLiveCanary: body.confirmLiveCanary === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

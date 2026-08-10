import { NextResponse } from "next/server";

import { sendPreventiveMaintenanceManualEmailPilot } from "@/lib/preventive-maintenance-notification-dispatch";
import {
  PreventiveMaintenanceNotificationApiError,
  resolvePreventiveMaintenanceNotificationAudience,
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
    { error: "Unable to complete the manual live email pilot." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const body = await request.json().catch(() => null);
    const result = await sendPreventiveMaintenanceManualEmailPilot({
      audience,
      request: body,
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

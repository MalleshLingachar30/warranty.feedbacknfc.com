import { NextResponse } from "next/server";

import { getPreventiveMaintenanceDemoReadiness } from "@/lib/preventive-maintenance-demo-readiness";
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
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();

    if (audience.role !== "manufacturer_admin" || !audience.organizationId) {
      throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
    }

    const readiness = await getPreventiveMaintenanceDemoReadiness({
      organizationId: audience.organizationId,
    });

    return NextResponse.json(readiness);
  } catch (error) {
    return jsonError(error);
  }
}

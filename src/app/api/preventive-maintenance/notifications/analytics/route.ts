import { NextResponse } from "next/server";

import {
  getPmNotificationReporting,
  resolvePmNotificationReportingAudience,
} from "@/lib/preventive-maintenance-notification-reporting";
import {
  parsePmNotificationReportingFilters,
  PmNotificationReportingFilterError,
} from "@/lib/preventive-maintenance-notification-reporting-policy";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof PreventiveMaintenanceNotificationApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof PmNotificationReportingFilterError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Unable to load PM notification analytics." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const audience = await resolvePmNotificationReportingAudience();
    const filters = parsePmNotificationReportingFilters(
      new URL(request.url).searchParams,
    );
    const reporting = await getPmNotificationReporting({ audience, filters });
    const analytics = { ...reporting, complianceRows: undefined };

    return NextResponse.json(analytics, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

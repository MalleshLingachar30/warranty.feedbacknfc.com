import { NextResponse } from "next/server";

import {
  getPmNotificationReporting,
  resolvePmNotificationReportingAudience,
} from "@/lib/preventive-maintenance-notification-reporting";
import {
  buildPmNotificationComplianceCsv,
  parsePmNotificationReportingFilters,
  PmNotificationReportingFilterError,
} from "@/lib/preventive-maintenance-notification-reporting-policy";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

function reportError(error: unknown) {
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
    { error: "Unable to export the PM notification compliance report." },
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
    const csv = buildPmNotificationComplianceCsv(reporting.complianceRows);
    const filename = `pm-notification-compliance-${filters.startDate}-to-${filters.endDate}.csv`;

    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return reportError(error);
  }
}

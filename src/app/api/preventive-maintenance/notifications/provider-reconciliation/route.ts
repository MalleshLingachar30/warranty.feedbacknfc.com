import { NextResponse } from "next/server";

import { resolvePmNotificationReportingAudience } from "@/lib/preventive-maintenance-notification-reporting";
import { reconcilePreventiveMaintenanceProviderEvents } from "@/lib/preventive-maintenance-provider-reconciliation";
import {
  parsePreventiveMaintenanceProviderReconciliationRequest,
  PreventiveMaintenanceProviderReconciliationInputError,
} from "@/lib/preventive-maintenance-provider-reconciliation-policy";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-notifications";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof PreventiveMaintenanceNotificationApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof PreventiveMaintenanceProviderReconciliationInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Unable to reconcile PM notification provider events." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const audience = await resolvePmNotificationReportingAudience();
    const body = await request.json().catch(() => null);
    const events =
      parsePreventiveMaintenanceProviderReconciliationRequest(body);
    const result = await reconcilePreventiveMaintenanceProviderEvents({
      audience,
      events,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

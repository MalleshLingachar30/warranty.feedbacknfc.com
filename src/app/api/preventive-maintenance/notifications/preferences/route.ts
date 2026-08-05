import { NextResponse } from "next/server";

import { canDispatchPreventiveMaintenanceNotifications } from "@/lib/preventive-maintenance-notification-dispatch";
import {
  getPreventiveMaintenanceNotificationPreferences,
  parsePreventiveMaintenanceNotificationPreferencePayload,
  updatePreventiveMaintenanceNotificationPreferences,
} from "@/lib/preventive-maintenance-notification-preferences";
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

function requirePreferenceOrganization(
  audience: Awaited<
    ReturnType<typeof resolvePreventiveMaintenanceNotificationAudience>
  >,
) {
  if (!canDispatchPreventiveMaintenanceNotifications(audience.role)) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  if (!audience.organizationId) {
    throw new PreventiveMaintenanceNotificationApiError(
      "An organization context is required to view PM notification preferences.",
      400,
    );
  }

  return audience.organizationId;
}

export async function GET() {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    const organizationId = requirePreferenceOrganization(audience);
    const preferences = await getPreventiveMaintenanceNotificationPreferences(
      organizationId,
      audience.role,
    );

    return NextResponse.json({ preferences });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const audience = await resolvePreventiveMaintenanceNotificationAudience();
    requirePreferenceOrganization(audience);
    const roles = parsePreventiveMaintenanceNotificationPreferencePayload(
      await request.json().catch(() => null),
    );
    const preferences =
      await updatePreventiveMaintenanceNotificationPreferences({
        audience,
        roles,
      });

    return NextResponse.json({ preferences });
  } catch (error) {
    return jsonError(error);
  }
}

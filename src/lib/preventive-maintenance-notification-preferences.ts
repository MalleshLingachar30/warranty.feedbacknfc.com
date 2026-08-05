import "server-only";

import type { PreventiveMaintenanceNotificationRecipientRole } from "@prisma/client";

import { db } from "@/lib/db";
import {
  finishPreventiveMaintenanceNotificationAuditSafely,
  preventiveMaintenanceAuditErrorMessage,
  startPreventiveMaintenanceNotificationAudit,
} from "@/lib/preventive-maintenance-notification-audit";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-api-error";
import {
  PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES,
  resolvePreventiveMaintenanceNotificationRolePreferences,
  type PreventiveMaintenanceNotificationPreferenceRole,
  type PreventiveMaintenanceNotificationRolePreference,
} from "@/lib/preventive-maintenance-notification-preference-policy";
import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";
import type { AppRole } from "@/lib/roles";

export type SerializedPreventiveMaintenanceNotificationPreferences = {
  organizationId: string;
  canManage: boolean;
  roles: PreventiveMaintenanceNotificationRolePreference[];
  emailEnabledRoleCount: number;
  smsEnabledRoleCount: number;
  smsDeliverySupported: false;
};

type PreferenceWrite = {
  recipientRole: PreventiveMaintenanceNotificationPreferenceRole;
  emailEnabled: boolean;
  smsEnabled: boolean;
};

export function canManagePreventiveMaintenanceNotificationPreferences(
  role: AppRole,
) {
  return (
    role === "platform_owner" ||
    role === "field_super_admin" ||
    role === "field_service_admin" ||
    role === "manufacturer_admin" ||
    role === "service_center_admin"
  );
}

export async function getPreventiveMaintenanceNotificationPreferences(
  organizationId: string,
  role: AppRole,
): Promise<SerializedPreventiveMaintenanceNotificationPreferences> {
  const stored = await db.preventiveMaintenanceNotificationPreference.findMany({
    where: { organizationId },
    orderBy: { recipientRole: "asc" },
    select: {
      recipientRole: true,
      emailEnabled: true,
      smsEnabled: true,
      updatedAt: true,
    },
  });
  const roles = resolvePreventiveMaintenanceNotificationRolePreferences(stored);

  return serializePreferences({
    organizationId,
    canManage: canManagePreventiveMaintenanceNotificationPreferences(role),
    roles,
  });
}

export async function getPreventiveMaintenanceNotificationPreferencesForOrganizations(
  organizationIds: string[],
) {
  const uniqueOrganizationIds = [...new Set(organizationIds)];
  if (uniqueOrganizationIds.length === 0) {
    return new Map<string, PreventiveMaintenanceNotificationRolePreference[]>();
  }

  const stored = await db.preventiveMaintenanceNotificationPreference.findMany({
    where: {
      organizationId: { in: uniqueOrganizationIds },
    },
    select: {
      organizationId: true,
      recipientRole: true,
      emailEnabled: true,
      smsEnabled: true,
      updatedAt: true,
    },
  });

  const storedByOrganization = new Map<
    string,
    Array<{
      recipientRole: PreventiveMaintenanceNotificationRecipientRole;
      emailEnabled: boolean;
      smsEnabled: boolean;
      updatedAt: Date;
    }>
  >();

  for (const row of stored) {
    const existing = storedByOrganization.get(row.organizationId) ?? [];
    existing.push(row);
    storedByOrganization.set(row.organizationId, existing);
  }

  return new Map(
    uniqueOrganizationIds.map((organizationId) => [
      organizationId,
      resolvePreventiveMaintenanceNotificationRolePreferences(
        storedByOrganization.get(organizationId) ?? [],
      ),
    ]),
  );
}

export async function updatePreventiveMaintenanceNotificationPreferences(input: {
  audience: PreventiveMaintenanceNotificationAudience;
  roles: PreferenceWrite[];
}) {
  if (!input.audience.organizationId) {
    throw new PreventiveMaintenanceNotificationApiError(
      "An organization context is required to manage PM notification preferences.",
      400,
    );
  }

  if (
    !canManagePreventiveMaintenanceNotificationPreferences(input.audience.role)
  ) {
    throw new PreventiveMaintenanceNotificationApiError("Forbidden", 403);
  }

  const normalized = parsePreferenceWrites(input.roles);
  const audit = await startPreventiveMaintenanceNotificationAudit({
    audience: input.audience,
    operation: "preference_update",
    metadata: {
      recipientRoles: normalized.map((preference) => preference.recipientRole),
    },
  });

  try {
    await db.$transaction(
      normalized.map((preference) =>
        db.preventiveMaintenanceNotificationPreference.upsert({
          where: {
            organizationId_recipientRole: {
              organizationId: input.audience.organizationId!,
              recipientRole: preference.recipientRole,
            },
          },
          create: {
            organizationId: input.audience.organizationId!,
            recipientRole: preference.recipientRole,
            emailEnabled: preference.emailEnabled,
            smsEnabled: preference.smsEnabled,
            updatedByUserId: input.audience.dbUserId,
          },
          update: {
            emailEnabled: preference.emailEnabled,
            smsEnabled: preference.smsEnabled,
            updatedByUserId: input.audience.dbUserId,
          },
        }),
      ),
    );

    const result = await getPreventiveMaintenanceNotificationPreferences(
      input.audience.organizationId,
      input.audience.role,
    );
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome: "succeeded",
      metadata: {
        rules: result.roles.map((preference) => ({
          recipientRole: preference.recipientRole,
          emailEnabled: preference.emailEnabled,
          smsEnabled: preference.smsEnabled,
        })),
        smsDeliverySupported: false,
      },
    });
    return result;
  } catch (error) {
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome: "failed",
      errorMessage: preventiveMaintenanceAuditErrorMessage(error),
    });
    throw error;
  }
}

export function parsePreventiveMaintenanceNotificationPreferencePayload(
  value: unknown,
): PreferenceWrite[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Invalid JSON body.",
      400,
    );
  }

  const roles = (value as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) {
    throw new PreventiveMaintenanceNotificationApiError(
      "roles must include every supported PM notification audience.",
      400,
    );
  }

  return parsePreferenceWrites(roles);
}

function parsePreferenceWrites(value: unknown[]): PreferenceWrite[] {
  const parsed = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new PreventiveMaintenanceNotificationApiError(
        "Each preference rule must be an object.",
        400,
      );
    }

    const rule = entry as Record<string, unknown>;
    if (
      typeof rule.recipientRole !== "string" ||
      !PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES.includes(
        rule.recipientRole as PreventiveMaintenanceNotificationPreferenceRole,
      ) ||
      typeof rule.emailEnabled !== "boolean" ||
      typeof rule.smsEnabled !== "boolean"
    ) {
      throw new PreventiveMaintenanceNotificationApiError(
        "Each preference rule requires a valid recipientRole and boolean emailEnabled/smsEnabled values.",
        400,
      );
    }

    return {
      recipientRole:
        rule.recipientRole as PreventiveMaintenanceNotificationPreferenceRole,
      emailEnabled: rule.emailEnabled,
      smsEnabled: rule.smsEnabled,
    };
  });
  const roles = new Set(parsed.map((preference) => preference.recipientRole));

  if (
    parsed.length !==
      PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES.length ||
    roles.size !== PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES.length
  ) {
    throw new PreventiveMaintenanceNotificationApiError(
      "Submit exactly one rule for every supported PM notification audience.",
      400,
    );
  }

  return PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES.map(
    (recipientRole) =>
      parsed.find((preference) => preference.recipientRole === recipientRole)!,
  );
}

function serializePreferences(input: {
  organizationId: string;
  canManage: boolean;
  roles: PreventiveMaintenanceNotificationRolePreference[];
}) {
  return {
    organizationId: input.organizationId,
    canManage: input.canManage,
    roles: input.roles,
    emailEnabledRoleCount: input.roles.filter(
      (preference) => preference.emailEnabled,
    ).length,
    smsEnabledRoleCount: input.roles.filter(
      (preference) => preference.smsEnabled,
    ).length,
    smsDeliverySupported: false as const,
  };
}

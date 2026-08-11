export const PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES = [
  "manufacturer",
  "service_center",
  "technician",
  "customer",
] as const;

export type PreventiveMaintenanceNotificationPreferenceRole =
  (typeof PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES)[number];

export type PreventiveMaintenanceNotificationPreferenceChannel =
  | "email"
  | "sms";

export type PreventiveMaintenanceNotificationRolePreference = {
  recipientRole: PreventiveMaintenanceNotificationPreferenceRole;
  emailEnabled: boolean;
  smsEnabled: boolean;
  source: "default" | "organization_override";
  updatedAt: string | null;
};

export const PREVENTIVE_MAINTENANCE_NOTIFICATION_ROLE_DEFAULTS =
  PREVENTIVE_MAINTENANCE_NOTIFICATION_RECIPIENT_ROLES.map(
    (recipientRole): PreventiveMaintenanceNotificationRolePreference => ({
      recipientRole,
      emailEnabled: true,
      smsEnabled: false,
      source: "default",
      updatedAt: null,
    }),
  );

export function resolvePreventiveMaintenanceNotificationRolePreferences(
  overrides: ReadonlyArray<{
    recipientRole: PreventiveMaintenanceNotificationPreferenceRole;
    emailEnabled: boolean;
    smsEnabled: boolean;
    updatedAt?: Date | string | null;
  }>,
): PreventiveMaintenanceNotificationRolePreference[] {
  const overrideByRole = new Map(
    overrides.map((override) => [override.recipientRole, override]),
  );

  return PREVENTIVE_MAINTENANCE_NOTIFICATION_ROLE_DEFAULTS.map((defaults) => {
    const override = overrideByRole.get(defaults.recipientRole);
    if (!override) {
      return { ...defaults };
    }

    return {
      recipientRole: override.recipientRole,
      emailEnabled: override.emailEnabled,
      smsEnabled: override.smsEnabled,
      source: "organization_override",
      updatedAt: override.updatedAt
        ? new Date(override.updatedAt).toISOString()
        : null,
    };
  });
}

export function getPreventiveMaintenanceNotificationRolePreference(
  preferences: ReadonlyArray<PreventiveMaintenanceNotificationRolePreference>,
  recipientRole: PreventiveMaintenanceNotificationPreferenceRole,
) {
  return (
    preferences.find(
      (preference) => preference.recipientRole === recipientRole,
    ) ??
    PREVENTIVE_MAINTENANCE_NOTIFICATION_ROLE_DEFAULTS.find(
      (preference) => preference.recipientRole === recipientRole,
    )!
  );
}

export function resolvePreventiveMaintenanceNotificationSuppression(input: {
  recipientRole: PreventiveMaintenanceNotificationPreferenceRole;
  channel: PreventiveMaintenanceNotificationPreferenceChannel;
  preference: PreventiveMaintenanceNotificationRolePreference;
  recipientAvailable: boolean;
  recipientAddress: string | null;
  dryRun: boolean;
  emailDeliverySkipReason: string | null;
  recipientHygieneBlockReason?: string | null;
}) {
  if (!input.recipientAvailable) {
    return `${input.recipientRole}_unavailable`;
  }

  if (!input.recipientAddress) {
    return `${input.recipientRole}_missing_${
      input.channel === "email" ? "email" : "phone"
    }`;
  }

  const channelEnabled =
    input.channel === "email"
      ? input.preference.emailEnabled
      : input.preference.smsEnabled;

  if (!channelEnabled) {
    return `${input.recipientRole}_${input.channel}_disabled`;
  }

  if (input.channel === "sms") {
    return "sms_delivery_unsupported";
  }

  if (input.recipientHygieneBlockReason) {
    return input.recipientHygieneBlockReason;
  }

  if (input.dryRun) {
    return "dry_run";
  }

  return input.emailDeliverySkipReason;
}

export function isPreventiveMaintenancePreferenceSuppressionReason(
  reason: string | null,
) {
  return Boolean(
    reason?.endsWith("_email_disabled") || reason?.endsWith("_sms_disabled"),
  );
}

export function isPreventiveMaintenanceMissingRecipientReason(
  reason: string | null,
) {
  return Boolean(
    reason &&
    (reason.includes("_missing_email") ||
      reason.includes("_missing_phone") ||
      reason.endsWith("_unavailable")),
  );
}

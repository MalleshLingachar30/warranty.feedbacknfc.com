export type PreventiveMaintenanceEmailDeliveryReadiness = {
  provider: "resend";
  liveEmail: {
    status: "disabled" | "incomplete" | "ready";
    enabled: boolean;
    apiKeyConfigured: boolean;
    fromEmailConfigured: boolean;
    missingConfiguration: string[];
  };
  canary: {
    status: "disabled" | "incomplete" | "ready";
    enabled: boolean;
    recipientConfigured: boolean;
    recipientAddressMasked: string | null;
    missingConfiguration: string[];
  };
  sms: {
    status: "unsupported";
  };
};

type ReadinessEnvironment = Readonly<Record<string, string | undefined>>;

export function resolvePreventiveMaintenanceEmailDeliveryReadiness(
  environment: ReadinessEnvironment,
  maskRecipient: (recipient: string) => string,
): PreventiveMaintenanceEmailDeliveryReadiness {
  const deliveryEnabled =
    environment.PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED === "true";
  const apiKeyConfigured = Boolean(environment.RESEND_API_KEY?.trim());
  const fromEmailConfigured = isValidEmailSender(environment.RESEND_FROM_EMAIL);
  const canaryEnabled =
    environment.PM_NOTIFICATION_EMAIL_CANARY_ENABLED === "true";
  const canaryRecipient =
    environment.PM_NOTIFICATION_EMAIL_CANARY_RECIPIENT?.trim();
  const canaryRecipientValid = isValidEmailAddress(canaryRecipient);
  const liveMissingConfiguration = [
    ...(apiKeyConfigured ? [] : ["RESEND_API_KEY"]),
    ...(fromEmailConfigured ? [] : ["RESEND_FROM_EMAIL"]),
  ];
  const canaryMissingConfiguration = [
    ...(deliveryEnabled ? [] : ["PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED"]),
    ...(apiKeyConfigured ? [] : ["RESEND_API_KEY"]),
    ...(fromEmailConfigured ? [] : ["RESEND_FROM_EMAIL"]),
    ...(canaryRecipientValid ? [] : ["PM_NOTIFICATION_EMAIL_CANARY_RECIPIENT"]),
  ];

  return {
    provider: "resend",
    liveEmail: {
      status: !deliveryEnabled
        ? "disabled"
        : liveMissingConfiguration.length > 0
          ? "incomplete"
          : "ready",
      enabled: deliveryEnabled,
      apiKeyConfigured,
      fromEmailConfigured,
      missingConfiguration: liveMissingConfiguration,
    },
    canary: {
      status: !canaryEnabled
        ? "disabled"
        : canaryMissingConfiguration.length > 0
          ? "incomplete"
          : "ready",
      enabled: canaryEnabled,
      recipientConfigured: canaryRecipientValid,
      recipientAddressMasked:
        canaryRecipientValid && canaryRecipient
          ? maskRecipient(canaryRecipient)
          : null,
      missingConfiguration: canaryMissingConfiguration,
    },
    sms: {
      status: "unsupported",
    },
  };
}

function isValidEmailAddress(value: string | null | undefined) {
  return Boolean(
    value && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  );
}

export function isValidEmailSender(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }

  const bracketedAddress = normalized.match(/<([^<>]+)>$/)?.[1]?.trim();
  return isValidEmailAddress(bracketedAddress ?? normalized);
}

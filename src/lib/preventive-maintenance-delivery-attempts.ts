export type PreventiveMaintenanceDeliveryAttemptChannel = "email" | "sms";

export type PreventiveMaintenanceDeliveryAttemptStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "dead_letter"
  | "skipped";

export type PreventiveMaintenanceDeliveryProviderEventStatus =
  | "accepted"
  | "sent"
  | "delivered"
  | "bounced"
  | "suppressed"
  | "delivery_delayed"
  | "complained"
  | "failed"
  | "unknown";

export type PreventiveMaintenanceDeliveryAttemptForView = {
  id: string;
  channel: PreventiveMaintenanceDeliveryAttemptChannel;
  status: PreventiveMaintenanceDeliveryAttemptStatus;
  dryRun: boolean;
  recipientAddress: string | null;
  providerMessageId: string | null;
  providerEventStatus: PreventiveMaintenanceDeliveryProviderEventStatus | null;
  providerEventAt: Date | null;
  providerReconciledAt: Date | null;
  errorMessage: string | null;
  skipReason: string | null;
  attemptNumber: number;
  nextRetryAt?: Date | null;
  deadLetteredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedPreventiveMaintenanceDeliveryAttemptForView = {
  id: string;
  channel: PreventiveMaintenanceDeliveryAttemptChannel;
  status: PreventiveMaintenanceDeliveryAttemptStatus;
  dryRun: boolean;
  recipientAddressMasked: string | null;
  hasRecipientAddress: boolean;
  providerMessageId: string | null;
  providerEventStatus: PreventiveMaintenanceDeliveryProviderEventStatus | null;
  providerEventAt: string | null;
  providerReconciledAt: string | null;
  recipientHygieneRisk: boolean;
  errorMessage: string | null;
  skipReason: string | null;
  attemptNumber: number;
  nextRetryAt: string | null;
  deadLetteredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function maskSegment(value: string, visibleStart = 1, visibleEnd = 0) {
  if (value.length <= visibleStart + visibleEnd) {
    return "*".repeat(Math.max(3, value.length));
  }

  const start = value.slice(0, visibleStart);
  const end = visibleEnd > 0 ? value.slice(-visibleEnd) : "";

  return `${start}***${end}`;
}

export function maskPreventiveMaintenanceDeliveryRecipientAddress(
  recipientAddress: string | null,
  channel: PreventiveMaintenanceDeliveryAttemptChannel,
) {
  if (!recipientAddress) {
    return null;
  }

  if (channel === "sms") {
    const digits = recipientAddress.replace(/\D/g, "");
    const suffix = digits.slice(-4);
    return suffix ? `***${suffix}` : "***";
  }

  const [localPart, domainPart] = recipientAddress.split("@");

  if (!localPart || !domainPart) {
    return maskSegment(recipientAddress, 1, 2);
  }

  const domainSegments = domainPart.split(".");
  const domainLabel = domainSegments[0] ?? "";
  const domainSuffix = domainSegments.slice(1).join(".");
  const maskedDomain = domainSuffix
    ? `${maskSegment(domainLabel)}.${domainSuffix}`
    : maskSegment(domainPart);

  return `${maskSegment(localPart)}@${maskedDomain}`;
}

export function serializePreventiveMaintenanceDeliveryAttemptForView(
  attempt: PreventiveMaintenanceDeliveryAttemptForView,
): SerializedPreventiveMaintenanceDeliveryAttemptForView {
  const recipientAddressMasked =
    maskPreventiveMaintenanceDeliveryRecipientAddress(
      attempt.recipientAddress,
      attempt.channel,
    );

  return {
    id: attempt.id,
    channel: attempt.channel,
    status: attempt.status,
    dryRun: attempt.dryRun,
    recipientAddressMasked,
    hasRecipientAddress: Boolean(attempt.recipientAddress),
    providerMessageId: attempt.providerMessageId,
    providerEventStatus: attempt.providerEventStatus,
    providerEventAt: attempt.providerEventAt?.toISOString() ?? null,
    providerReconciledAt: attempt.providerReconciledAt?.toISOString() ?? null,
    recipientHygieneRisk:
      attempt.providerEventStatus === "bounced" ||
      attempt.providerEventStatus === "suppressed" ||
      attempt.providerEventStatus === "complained" ||
      Boolean(attempt.skipReason?.startsWith("recipient_hygiene_blocked_")),
    errorMessage: redactRecipientFromDiagnostic({
      value: attempt.errorMessage,
      recipientAddress: attempt.recipientAddress,
      recipientAddressMasked,
    }),
    skipReason: attempt.skipReason,
    attemptNumber: attempt.attemptNumber,
    nextRetryAt: attempt.nextRetryAt?.toISOString() ?? null,
    deadLetteredAt: attempt.deadLetteredAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

function redactRecipientFromDiagnostic(input: {
  value: string | null;
  recipientAddress: string | null;
  recipientAddressMasked: string | null;
}) {
  if (!input.value || !input.recipientAddress) {
    return input.value;
  }

  return input.value.replaceAll(
    input.recipientAddress,
    input.recipientAddressMasked ?? "***",
  );
}

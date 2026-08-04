import "server-only";

import { Prisma } from "@prisma/client";

import { maskPreventiveMaintenanceDeliveryRecipientAddress } from "@/lib/preventive-maintenance-delivery-attempts";
import {
  isValidEmailSender,
  resolvePreventiveMaintenanceEmailDeliveryReadiness,
  type PreventiveMaintenanceEmailDeliveryReadiness,
} from "@/lib/preventive-maintenance-email-readiness";

export type { PreventiveMaintenanceEmailDeliveryReadiness } from "@/lib/preventive-maintenance-email-readiness";

type ResendEmailDeliveryInput = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

type ResendEmailDeliveryResult =
  | {
      ok: true;
      providerMessageId: string | null;
      providerResponse: Prisma.InputJsonValue;
    }
  | {
      ok: false;
      errorMessage: string;
      providerResponse: Prisma.InputJsonValue | null;
    };

type EmailDeliveryConfiguration =
  | {
      enabled: true;
      apiKey: string;
      from: string;
    }
  | {
      enabled: false;
      skipReason:
        | "email_delivery_disabled"
        | "missing_resend_api_key"
        | "missing_resend_from_email"
        | "invalid_resend_from_email";
    };

type EmailCanaryConfiguration =
  | {
      enabled: true;
      recipient: string;
      recipientAddressMasked: string;
    }
  | {
      enabled: false;
      recipientAddressMasked: string | null;
      skipReason:
        | "email_canary_disabled"
        | "missing_email_canary_recipient"
        | "invalid_email_canary_recipient"
        | "email_delivery_disabled"
        | "missing_resend_api_key"
        | "missing_resend_from_email"
        | "invalid_resend_from_email";
    };

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

export function getPreventiveMaintenanceEmailDeliveryConfiguration(): EmailDeliveryConfiguration {
  if (process.env.PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED !== "true") {
    return {
      enabled: false,
      skipReason: "email_delivery_disabled",
    };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      enabled: false,
      skipReason: "missing_resend_api_key",
    };
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    return {
      enabled: false,
      skipReason: "missing_resend_from_email",
    };
  }

  if (!isValidEmailSender(from)) {
    return {
      enabled: false,
      skipReason: "invalid_resend_from_email",
    };
  }

  return {
    enabled: true,
    apiKey,
    from,
  };
}

export function getPreventiveMaintenanceEmailDeliveryReadiness(): PreventiveMaintenanceEmailDeliveryReadiness {
  return resolvePreventiveMaintenanceEmailDeliveryReadiness(
    process.env,
    (recipient) =>
      maskPreventiveMaintenanceDeliveryRecipientAddress(recipient, "email") ??
      "***",
  );
}

export function getPreventiveMaintenanceEmailCanaryConfiguration(): EmailCanaryConfiguration {
  const readiness = getPreventiveMaintenanceEmailDeliveryReadiness();

  if (!readiness.canary.enabled) {
    return {
      enabled: false,
      recipientAddressMasked: readiness.canary.recipientAddressMasked,
      skipReason: "email_canary_disabled",
    };
  }

  const emailConfiguration =
    getPreventiveMaintenanceEmailDeliveryConfiguration();
  if (!emailConfiguration.enabled) {
    return {
      enabled: false,
      recipientAddressMasked: readiness.canary.recipientAddressMasked,
      skipReason: emailConfiguration.skipReason,
    };
  }

  const recipient = process.env.PM_NOTIFICATION_EMAIL_CANARY_RECIPIENT?.trim();
  if (!recipient) {
    return {
      enabled: false,
      recipientAddressMasked: null,
      skipReason: "missing_email_canary_recipient",
    };
  }

  if (!readiness.canary.recipientConfigured) {
    return {
      enabled: false,
      recipientAddressMasked: null,
      skipReason: "invalid_email_canary_recipient",
    };
  }

  return {
    enabled: true,
    recipient,
    recipientAddressMasked:
      maskPreventiveMaintenanceDeliveryRecipientAddress(recipient, "email") ??
      "***",
  };
}

export async function sendPreventiveMaintenanceEmailWithResend(
  input: ResendEmailDeliveryInput,
): Promise<ResendEmailDeliveryResult> {
  const config = getPreventiveMaintenanceEmailDeliveryConfiguration();

  if (!config.enabled) {
    return {
      ok: false,
      errorMessage: config.skipReason,
      providerResponse: {
        skipped: true,
        skipReason: config.skipReason,
      },
    };
  }

  try {
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });

    const providerResponse = await parseProviderResponse(response);

    if (!response.ok) {
      return {
        ok: false,
        errorMessage: truncateErrorMessage(
          extractProviderError(providerResponse) ??
            `Resend email request failed with status ${response.status}.`,
        ),
        providerResponse,
      };
    }

    return {
      ok: true,
      providerMessageId: extractProviderId(providerResponse),
      providerResponse,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: truncateErrorMessage(
        error instanceof Error ? error.message : "Resend email request failed.",
      ),
      providerResponse: null,
    };
  }
}

async function parseProviderResponse(
  response: Response,
): Promise<Prisma.InputJsonValue> {
  const text = await response.text();

  if (!text) {
    return {
      status: response.status,
    };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (isJsonObject(parsed) || Array.isArray(parsed)) {
      return parsed as Prisma.InputJsonValue;
    }

    return {
      status: response.status,
      body: String(parsed),
    };
  } catch {
    return {
      status: response.status,
      body: truncateErrorMessage(text),
    };
  }
}

function extractProviderId(value: unknown) {
  if (!isJsonObject(value)) {
    return null;
  }

  const id = value.id;
  return typeof id === "string" && id.trim() ? id : null;
}

function extractProviderError(value: unknown) {
  if (!isJsonObject(value)) {
    return null;
  }

  const message = value.message ?? value.error;
  return typeof message === "string" && message.trim() ? message : null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function truncateErrorMessage(value: string) {
  return value.length > 1_000 ? `${value.slice(0, 997)}...` : value;
}

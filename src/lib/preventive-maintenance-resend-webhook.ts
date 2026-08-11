import { createHmac, timingSafeEqual } from "node:crypto";

import {
  mapResendProviderEventStatus,
  type PreventiveMaintenanceProviderReconciliationEvent,
} from "@/lib/preventive-maintenance-provider-reconciliation-policy";

const RESEND_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const SUPPORTED_RESEND_PM_EVENT_TYPES = new Set([
  "email.accepted",
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.suppressed",
  "email.delivery_delayed",
  "email.complained",
  "email.failed",
  "email.unknown",
]);

export type PreventiveMaintenanceResendWebhookRejectionReason =
  | "missing_signing_secret"
  | "invalid_signing_secret"
  | "missing_signature_headers"
  | "invalid_signature_timestamp"
  | "expired_signature_timestamp"
  | "invalid_signature"
  | "invalid_json"
  | "invalid_payload"
  | "unsupported_event_type"
  | "payload_too_large";

export class PreventiveMaintenanceResendWebhookError extends Error {
  constructor(
    message: string,
    readonly rejectionReason: PreventiveMaintenanceResendWebhookRejectionReason,
  ) {
    super(message);
  }
}

function decodeWebhookSigningSecret(secret: string) {
  if (!secret.startsWith("whsec_") || secret.length <= "whsec_".length) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signing is not configured correctly.",
      "invalid_signing_secret",
    );
  }

  const encodedSecret = secret.slice("whsec_".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedSecret)) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signing is not configured correctly.",
      "invalid_signing_secret",
    );
  }

  const decodedSecret = Buffer.from(encodedSecret, "base64");
  if (decodedSecret.length === 0) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signing is not configured correctly.",
      "invalid_signing_secret",
    );
  }
  return decodedSecret;
}

export function verifyPreventiveMaintenanceResendWebhookSignature(input: {
  payload: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  signingSecret: string | undefined;
  now?: Date;
}) {
  if (!input.signingSecret?.trim()) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signing is unavailable.",
      "missing_signing_secret",
    );
  }

  const webhookId = input.webhookId?.trim();
  const webhookTimestamp = input.webhookTimestamp?.trim();
  const webhookSignature = input.webhookSignature?.trim();
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signature headers are required.",
      "missing_signature_headers",
    );
  }

  if (!/^\d+$/.test(webhookTimestamp)) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signature timestamp is invalid.",
      "invalid_signature_timestamp",
    );
  }
  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signature timestamp is invalid.",
      "invalid_signature_timestamp",
    );
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  if (
    Math.abs(nowSeconds - timestampSeconds) >
    RESEND_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signature timestamp is outside the allowed window.",
      "expired_signature_timestamp",
    );
  }

  const expectedSignature = createHmac(
    "sha256",
    decodeWebhookSigningSecret(input.signingSecret.trim()),
  )
    .update(`${webhookId}.${webhookTimestamp}.${input.payload}`)
    .digest();

  const signatureMatched = webhookSignature
    .split(/\s+/)
    .filter((signature) => signature.startsWith("v1,"))
    .some((signature) => {
      const encodedSignature = signature.slice("v1,".length);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedSignature)) {
        return false;
      }
      const receivedSignature = Buffer.from(encodedSignature, "base64");
      return (
        receivedSignature.length === expectedSignature.length &&
        timingSafeEqual(receivedSignature, expectedSignature)
      );
    });

  if (!signatureMatched) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook signature is invalid.",
      "invalid_signature",
    );
  }
}

function parseWebhookOccurredAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook requires a valid event timestamp.",
      "invalid_payload",
    );
  }
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook requires a valid event timestamp.",
      "invalid_payload",
    );
  }
  return occurredAt;
}

export function parsePreventiveMaintenanceResendWebhookPayload(
  payload: string,
): PreventiveMaintenanceProviderReconciliationEvent {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook payload must be valid JSON.",
      "invalid_json",
    );
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook payload must be an object.",
      "invalid_payload",
    );
  }

  const event = value as Record<string, unknown>;
  const sourceEventType = event.type;
  if (
    typeof sourceEventType !== "string" ||
    !SUPPORTED_RESEND_PM_EVENT_TYPES.has(sourceEventType)
  ) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook event type is not supported for PM reconciliation.",
      "unsupported_event_type",
    );
  }

  if (
    !event.data ||
    typeof event.data !== "object" ||
    Array.isArray(event.data)
  ) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook requires an event data object.",
      "invalid_payload",
    );
  }
  const data = event.data as Record<string, unknown>;
  const providerMessageId = data.email_id;
  if (
    typeof providerMessageId !== "string" ||
    !providerMessageId.trim() ||
    providerMessageId.length > 255
  ) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook requires a valid email identifier.",
      "invalid_payload",
    );
  }

  return {
    providerMessageId: providerMessageId.trim(),
    status: mapResendProviderEventStatus(sourceEventType),
    occurredAt: parseWebhookOccurredAt(event.created_at),
    sourceEventType,
  };
}

import { NextResponse } from "next/server";

import {
  reconcilePreventiveMaintenanceResendWebhookEvent,
  rejectPreventiveMaintenanceResendWebhookAudit,
  startPreventiveMaintenanceResendWebhookAudit,
} from "@/lib/preventive-maintenance-provider-reconciliation";
import {
  parsePreventiveMaintenanceResendWebhookPayload,
  PreventiveMaintenanceResendWebhookError,
  verifyPreventiveMaintenanceResendWebhookSignature,
} from "@/lib/preventive-maintenance-resend-webhook";

export const runtime = "nodejs";

const MAX_RESEND_WEBHOOK_PAYLOAD_BYTES = 128 * 1024;

function webhookErrorStatus(error: PreventiveMaintenanceResendWebhookError) {
  switch (error.rejectionReason) {
    case "missing_signing_secret":
    case "invalid_signing_secret":
      return 503;
    case "payload_too_large":
      return 413;
    case "missing_signature_headers":
    case "invalid_signature_timestamp":
    case "expired_signature_timestamp":
    case "invalid_signature":
      return 401;
    default:
      return 400;
  }
}

async function readWebhookPayload(request: Request) {
  const contentLength = request.headers.get("content-length");
  const declaredLength = contentLength ? Number(contentLength) : null;
  if (
    declaredLength !== null &&
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RESEND_WEBHOOK_PAYLOAD_BYTES
  ) {
    throw new PreventiveMaintenanceResendWebhookError(
      "Resend webhook payload is too large.",
      "payload_too_large",
    );
  }

  if (!request.body) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  const reader = request.body.getReader();
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    byteLength += value.byteLength;
    if (byteLength > MAX_RESEND_WEBHOOK_PAYLOAD_BYTES) {
      await reader.cancel();
      throw new PreventiveMaintenanceResendWebhookError(
        "Resend webhook payload is too large.",
        "payload_too_large",
      );
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  let auditId: string | null = null;
  let reconciliationStarted = false;

  try {
    const audit = await startPreventiveMaintenanceResendWebhookAudit();
    auditId = audit.id;

    const payload = await readWebhookPayload(request);
    verifyPreventiveMaintenanceResendWebhookSignature({
      payload,
      webhookId: request.headers.get("svix-id"),
      webhookTimestamp: request.headers.get("svix-timestamp"),
      webhookSignature: request.headers.get("svix-signature"),
      signingSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
    const event = parsePreventiveMaintenanceResendWebhookPayload(payload);

    reconciliationStarted = true;
    const result = await reconcilePreventiveMaintenanceResendWebhookEvent({
      auditId,
      event,
    });

    return NextResponse.json(
      {
        ok: true,
        submittedEventCount: result.submittedEventCount,
        matchedAttemptCount: result.matchedAttemptCount,
        updatedAttemptCount: result.updatedAttemptCount,
        staleEventCount: result.staleEventCount,
        notFoundCount: result.notFoundCount,
        ambiguousMatchCount: result.ambiguousMatchCount,
        hygieneSignalCount: result.hygieneSignalCount,
        eventTypes: [event.sourceEventType],
        providerEventCounts: result.providerEventCounts,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PreventiveMaintenanceResendWebhookError) {
      if (auditId) {
        await rejectPreventiveMaintenanceResendWebhookAudit({
          auditId,
          rejectionReason: error.rejectionReason,
        });
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        {
          status: webhookErrorStatus(error),
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    if (!reconciliationStarted) {
      console.error("Unable to receive PM Resend webhook.", error);
    }
    return NextResponse.json(
      { ok: false, error: "Unable to process PM Resend webhook." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}

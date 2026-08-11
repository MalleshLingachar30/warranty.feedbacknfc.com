import { describe, expect, it } from "vitest";

import {
  parsePreventiveMaintenanceResendWebhookPayload,
  PreventiveMaintenanceResendWebhookError,
  verifyPreventiveMaintenanceResendWebhookSignature,
} from "@/lib/preventive-maintenance-resend-webhook";

const signingSecret = "whsec_plJ3nmyCDGBKInavdOK15jsl";
const webhookId = "msg_loFOjxBNrRLzqYUf";
const webhookTimestamp = "1731705121";
const payload = '{"event_type":"ping","data":{"success":true}}';
const webhookSignature = "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=";

describe("verifyPreventiveMaintenanceResendWebhookSignature", () => {
  it("verifies the published Svix signature vector against the raw body", () => {
    expect(() =>
      verifyPreventiveMaintenanceResendWebhookSignature({
        payload,
        webhookId,
        webhookTimestamp,
        webhookSignature,
        signingSecret,
        now: new Date(Number(webhookTimestamp) * 1_000),
      }),
    ).not.toThrow();
  });

  it("rejects body tampering, missing auth headers, and expired signatures", () => {
    const inputs = [
      {
        payload: `${payload} `,
        webhookId,
        webhookTimestamp,
        webhookSignature,
        signingSecret,
        now: new Date(Number(webhookTimestamp) * 1_000),
        reason: "invalid_signature",
      },
      {
        payload,
        webhookId: null,
        webhookTimestamp,
        webhookSignature,
        signingSecret,
        now: new Date(Number(webhookTimestamp) * 1_000),
        reason: "missing_signature_headers",
      },
      {
        payload,
        webhookId,
        webhookTimestamp,
        webhookSignature,
        signingSecret,
        now: new Date((Number(webhookTimestamp) + 301) * 1_000),
        reason: "expired_signature_timestamp",
      },
    ];

    for (const input of inputs) {
      try {
        verifyPreventiveMaintenanceResendWebhookSignature(input);
        throw new Error("Expected signature verification to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(PreventiveMaintenanceResendWebhookError);
        expect(
          (error as PreventiveMaintenanceResendWebhookError).rejectionReason,
        ).toBe(input.reason);
      }
    }
  });
});

describe("parsePreventiveMaintenanceResendWebhookPayload", () => {
  it.each([
    ["email.accepted", "accepted"],
    ["email.sent", "sent"],
    ["email.delivered", "delivered"],
    ["email.bounced", "bounced"],
    ["email.suppressed", "suppressed"],
    ["email.delivery_delayed", "delivery_delayed"],
    ["email.complained", "complained"],
    ["email.failed", "failed"],
    ["email.unknown", "unknown"],
  ] as const)("maps %s to %s", (type, status) => {
    const event = parsePreventiveMaintenanceResendWebhookPayload(
      JSON.stringify({
        type,
        created_at: "2026-08-11T18:00:00.000Z",
        data: {
          email_id: "provider-message-1",
          to: ["private-recipient@example.com"],
          subject: "Private subject",
        },
      }),
    );

    expect(event).toEqual({
      providerMessageId: "provider-message-1",
      status,
      occurredAt: new Date("2026-08-11T18:00:00.000Z"),
      sourceEventType: type,
    });
    expect(JSON.stringify(event)).not.toContain(
      "private-recipient@example.com",
    );
    expect(JSON.stringify(event)).not.toContain("Private subject");
  });

  it("rejects non-delivery lifecycle events instead of regressing delivery state to unknown", () => {
    expect(() =>
      parsePreventiveMaintenanceResendWebhookPayload(
        JSON.stringify({
          type: "email.opened",
          created_at: "2026-08-11T18:00:00.000Z",
          data: { email_id: "provider-message-1" },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ rejectionReason: "unsupported_event_type" }),
    );
  });
});

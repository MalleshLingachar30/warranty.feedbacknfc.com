import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditReject: vi.fn(),
  auditStart: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@/lib/preventive-maintenance-provider-reconciliation", () => ({
  reconcilePreventiveMaintenanceResendWebhookEvent: mocks.reconcile,
  rejectPreventiveMaintenanceResendWebhookAudit: mocks.auditReject,
  startPreventiveMaintenanceResendWebhookAudit: mocks.auditStart,
}));

import { POST } from "@/app/api/preventive-maintenance/notifications/provider-webhooks/resend/route";

const signingSecret = "whsec_cG0td2ViaG9vay10ZXN0LXNlY3JldA==";
const signingKey = Buffer.from(signingSecret.slice("whsec_".length), "base64");
const webhookId = "msg_pm_webhook_1";
const webhookTimestamp = "1786464000";

function signedRequest(payload: string, signaturePayload = payload) {
  const signature = createHmac("sha256", signingKey)
    .update(`${webhookId}.${webhookTimestamp}.${signaturePayload}`)
    .digest("base64");
  return new Request(
    "http://localhost/api/preventive-maintenance/notifications/provider-webhooks/resend",
    {
      method: "POST",
      body: payload,
      headers: {
        "content-type": "application/json",
        "svix-id": webhookId,
        "svix-timestamp": webhookTimestamp,
        "svix-signature": `v1,${signature}`,
      },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Number(webhookTimestamp) * 1_000));
  process.env.RESEND_WEBHOOK_SECRET = signingSecret;
  mocks.auditStart.mockResolvedValue({ id: "audit-1" });
  mocks.auditReject.mockResolvedValue(undefined);
  mocks.reconcile.mockResolvedValue({
    submittedEventCount: 1,
    matchedAttemptCount: 1,
    updatedAttemptCount: 1,
    staleEventCount: 0,
    notFoundCount: 0,
    hygieneSignalCount: 1,
    providerEventCounts: {
      accepted: 0,
      sent: 0,
      delivered: 0,
      bounced: 1,
      suppressed: 0,
      delivery_delayed: 0,
      complained: 0,
      failed: 0,
      unknown: 0,
    },
  });
});

describe("POST PM Resend provider webhook", () => {
  it("requires a valid signature and persists a privacy-safe rejection reason", async () => {
    const response = await POST(
      new Request("http://localhost/webhook", {
        method: "POST",
        body: JSON.stringify({
          type: "email.bounced",
          data: { email_id: "provider-message-1" },
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.auditReject).toHaveBeenCalledWith({
      auditId: "audit-1",
      rejectionReason: "missing_signature_headers",
    });
    expect(JSON.stringify(mocks.auditReject.mock.calls)).not.toContain(
      "provider-message-1",
    );
  });

  it("reconciles an authentic Resend event and returns only canonical counts", async () => {
    const payload = JSON.stringify({
      type: "email.bounced",
      created_at: "2026-08-11T18:00:00.000Z",
      data: {
        email_id: "provider-message-1",
        to: ["private-recipient@example.com"],
        subject: "Private PM subject",
        bounce: { message: "Private SMTP diagnostic" },
      },
    });
    const response = await POST(signedRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith({
      auditId: "audit-1",
      event: expect.objectContaining({
        providerMessageId: "provider-message-1",
        status: "bounced",
        sourceEventType: "email.bounced",
      }),
    });
    expect(body).toMatchObject({
      ok: true,
      matchedAttemptCount: 1,
      updatedAttemptCount: 1,
      hygieneSignalCount: 1,
      eventTypes: ["email.bounced"],
    });
    expect(JSON.stringify(body)).not.toContain("provider-message-1");
    expect(JSON.stringify(body)).not.toContain("private-recipient@example.com");
    expect(JSON.stringify(body)).not.toContain("Private PM subject");
    expect(JSON.stringify(body)).not.toContain("Private SMTP diagnostic");
  });

  it("rejects a tampered body before reconciliation", async () => {
    const payload = JSON.stringify({
      type: "email.delivered",
      created_at: "2026-08-11T18:00:00.000Z",
      data: { email_id: "provider-message-1" },
    });
    const response = await POST(signedRequest(payload, `${payload} `));

    expect(response.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.auditReject).toHaveBeenCalledWith({
      auditId: "audit-1",
      rejectionReason: "invalid_signature",
    });
  });
});

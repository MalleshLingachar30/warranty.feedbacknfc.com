import { PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION } from "@/lib/preventive-maintenance-manual-email-pilot-policy";

export type PmNotificationManualEmailPilotAttempt = {
  id: string;
  notificationIntentId: string;
  channel: "email";
  status: "queued" | "sending" | "sent" | "failed" | "dead_letter" | "skipped";
  recipientAddressMasked: string | null;
  hasRecipientAddress: boolean;
  errorMessage: string | null;
  skipReason: string | null;
  attemptNumber: number;
  updatedAt: string;
};

export type PmNotificationManualEmailPilotResponse = {
  ok: true;
  mode: "manual_live_email_pilot";
  auditId: string;
  completedAt: string;
  selectedNotificationCount: number;
  scannedIntentCount: number;
  candidateAttemptCount: number;
  createdAttemptCount: number;
  existingAttemptCount: number;
  sentAttemptCount: number;
  failedAttemptCount: number;
  skippedAttemptCount: number;
  missingRecipientCount: number;
  preferenceSuppressedCount: number;
  providerCallCount: number;
  suppressionReasonCounts: Record<string, number>;
  attempts: PmNotificationManualEmailPilotAttempt[];
};

export async function runPmNotificationManualEmailPilot(input: {
  notificationIds: string[];
  fetchImpl?: typeof fetch;
}): Promise<PmNotificationManualEmailPilotResponse> {
  const response = await (input.fetchImpl ?? fetch)(
    "/api/preventive-maintenance/notifications/manual-email-pilot",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notificationIds: input.notificationIds,
        confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | PmNotificationManualEmailPilotResponse
    | { error?: string }
    | null;

  if (
    !response.ok ||
    !body ||
    !("ok" in body) ||
    body.mode !== "manual_live_email_pilot"
  ) {
    throw new Error(
      body && "error" in body
        ? (body.error ?? "Unable to complete the manual live email pilot.")
        : "Unable to complete the manual live email pilot.",
    );
  }

  return body;
}

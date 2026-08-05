export type PmNotificationDispatchResponse = {
  dryRun: boolean;
  preparedAt: string | null;
  scannedIntentCount: number;
  candidateAttemptCount: number;
  createdAttemptCount: number;
  existingAttemptCount: number;
  missingRecipientCount: number;
  queuedAttemptCount: number;
  skippedAttemptCount: number;
  preferenceSuppressedCount: number;
  suppressionReasonCounts: Record<string, number>;
};

type RunPmNotificationDryRunInput = {
  triggerType?: string;
  fetchImpl?: typeof fetch;
};

export async function runPmNotificationDryRun({
  triggerType,
  fetchImpl = fetch,
}: RunPmNotificationDryRunInput): Promise<PmNotificationDispatchResponse> {
  const response = await fetchImpl(
    "/api/preventive-maintenance/notifications/dispatch",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dryRun: true,
        channels: ["email", "sms"],
        limit: 50,
        triggerType,
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | PmNotificationDispatchResponse
    | { error?: string }
    | null;

  if (!response.ok || !body || !("createdAttemptCount" in body)) {
    throw new Error(
      body && "error" in body
        ? (body.error ?? "Unable to run delivery dry run.")
        : "Unable to run delivery dry run.",
    );
  }

  if (!body.dryRun) {
    throw new Error("The server did not confirm dry-run mode.");
  }

  return body;
}

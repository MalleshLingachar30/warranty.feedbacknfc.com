export const PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP = 5;

export const PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION =
  "SEND LIVE PM EMAIL PILOT";

const ALLOWED_REQUEST_FIELDS = new Set(["notificationIds", "confirmation"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PreventiveMaintenanceManualEmailPilotRequest = {
  notificationIds: string[];
  confirmation: typeof PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION;
};

export type PreventiveMaintenanceManualEmailPilotRequestResolution =
  | {
      ok: true;
      request: PreventiveMaintenanceManualEmailPilotRequest;
    }
  | {
      ok: false;
      status: 400;
      error: string;
    };

export function summarizePreventiveMaintenanceManualEmailPilotRequest(
  value: unknown,
) {
  if (!isRecord(value)) {
    return {
      confirmationProvided: false,
      requestedNotificationCount: 0,
      unexpectedFields: [] as string[],
    };
  }

  return {
    confirmationProvided:
      value.confirmation ===
      PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
    requestedNotificationCount: Array.isArray(value.notificationIds)
      ? value.notificationIds.length
      : 0,
    unexpectedFields: Object.keys(value)
      .filter((field) => !ALLOWED_REQUEST_FIELDS.has(field))
      .sort(),
  };
}

export function resolvePreventiveMaintenanceManualEmailPilotRequest(
  value: unknown,
): PreventiveMaintenanceManualEmailPilotRequestResolution {
  if (!isRecord(value)) {
    return reject("Invalid JSON body.");
  }

  const unexpectedFields = Object.keys(value).filter(
    (field) => !ALLOWED_REQUEST_FIELDS.has(field),
  );
  if (unexpectedFields.length > 0) {
    return reject(
      "Manual live email pilot accepts only notificationIds and confirmation. Scheduler, retry, dry-run, channel, and transport controls are not supported.",
    );
  }

  if (
    value.confirmation !==
    PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION
  ) {
    return reject(
      `Manual live email pilot requires confirmation: ${PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION}.`,
    );
  }

  if (!Array.isArray(value.notificationIds)) {
    return reject("notificationIds must be an explicit array of reviewed IDs.");
  }

  if (value.notificationIds.length === 0) {
    return reject("Select at least one reviewed PM notification.");
  }

  if (
    value.notificationIds.length >
    PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP
  ) {
    return reject(
      `Manual live email pilot is limited to ${PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP} notifications per request.`,
    );
  }

  if (
    value.notificationIds.some(
      (notificationId) =>
        typeof notificationId !== "string" ||
        !UUID_PATTERN.test(notificationId),
    )
  ) {
    return reject("Every notificationId must be a valid UUID.");
  }

  const notificationIds = value.notificationIds as string[];
  if (new Set(notificationIds).size !== notificationIds.length) {
    return reject(
      "notificationIds must be unique; duplicate IDs are ambiguous.",
    );
  }

  return {
    ok: true,
    request: {
      notificationIds,
      confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
    },
  };
}

function reject(
  error: string,
): PreventiveMaintenanceManualEmailPilotRequestResolution {
  return { ok: false, status: 400, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

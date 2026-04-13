import type {
  AssetLifecycleState,
  InstallationJobStatus,
  SaleRegistrationChannel,
  SaleRegistrationStatus,
} from "@prisma/client";

export const SALE_REGISTRATION_CHANNELS = [
  "carton_scan",
  "manual_admin",
  "erp_seeded",
  "salesman_assisted",
] as const satisfies readonly SaleRegistrationChannel[];

export const SALE_REGISTRATION_STATUSES = [
  "registered",
  "job_created",
  "cancelled",
] as const satisfies readonly SaleRegistrationStatus[];

export const INSTALLATION_JOB_STATUSES = [
  "pending_assignment",
  "assigned",
  "scheduled",
  "technician_enroute",
  "on_site",
  "commissioning",
  "completed",
  "cancelled",
  "failed",
] as const satisfies readonly InstallationJobStatus[];

export function formatWorkflowLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildSerializedSalesLineSourceKey(input: {
  sourceDocumentNumber?: string | null;
  sourceLineNumber?: string | null;
  serialNumber: string;
}) {
  const parts = [
    input.sourceDocumentNumber?.trim(),
    input.sourceLineNumber?.trim(),
    input.serialNumber.trim(),
  ].filter((value): value is string => Boolean(value && value.length > 0));

  return parts.length > 0 ? parts.join("::") : null;
}

export function saleRegistrationLifecycleState(): AssetLifecycleState {
  return "sold_pending_installation";
}

export function installationJobLifecycleState(
  status: InstallationJobStatus,
): AssetLifecycleState {
  switch (status) {
    case "assigned":
    case "scheduled":
      return "installation_scheduled";
    case "technician_enroute":
    case "on_site":
    case "commissioning":
    case "completed":
      return "installation_in_progress";
    case "cancelled":
    case "failed":
    case "pending_assignment":
    default:
      return "sold_pending_installation";
  }
}

export function parseOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseOptionalDate(value: unknown) {
  const raw = parseOptionalString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

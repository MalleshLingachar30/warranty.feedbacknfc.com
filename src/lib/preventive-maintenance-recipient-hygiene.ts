import { createHash } from "node:crypto";

export function normalizePreventiveMaintenanceRecipientAddress(
  address: string,
  channel: "email" | "sms",
) {
  const trimmed = address.trim();
  return channel === "email"
    ? trimmed.toLowerCase()
    : trimmed.replace(/\D/g, "");
}

export function hashPreventiveMaintenanceRecipientAddress(
  address: string,
  channel: "email" | "sms",
) {
  return createHash("sha256")
    .update(normalizePreventiveMaintenanceRecipientAddress(address, channel))
    .digest("hex");
}

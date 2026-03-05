import { db } from "@/lib/db";
import { ManufacturerSettingsClient } from "@/components/manufacturer/settings-client";
import { DEFAULT_SLA_HOURS } from "@/lib/sla-config";
import { normalizeManufacturerStickerConfig } from "@/lib/sticker-config";

import { resolveManufacturerPageContext } from "../_lib/server-context";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  return fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function asString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value;
}

function normalizeSeverityHours(value: unknown) {
  const source = isRecord(value) ? value : {};

  return {
    low: asNumber(source.low, DEFAULT_SLA_HOURS.responseHoursBySeverity.low),
    medium: asNumber(source.medium, DEFAULT_SLA_HOURS.responseHoursBySeverity.medium),
    high: asNumber(source.high, DEFAULT_SLA_HOURS.responseHoursBySeverity.high),
    critical: asNumber(
      source.critical,
      DEFAULT_SLA_HOURS.responseHoursBySeverity.critical,
    ),
  };
}

function normalizeResolutionSeverityHours(value: unknown) {
  const source = isRecord(value) ? value : {};

  return {
    low: asNumber(source.low, DEFAULT_SLA_HOURS.resolutionHoursBySeverity.low),
    medium: asNumber(
      source.medium,
      DEFAULT_SLA_HOURS.resolutionHoursBySeverity.medium,
    ),
    high: asNumber(source.high, DEFAULT_SLA_HOURS.resolutionHoursBySeverity.high),
    critical: asNumber(
      source.critical,
      DEFAULT_SLA_HOURS.resolutionHoursBySeverity.critical,
    ),
  };
}

function normalizeNotificationEvents(value: unknown) {
  const source = isRecord(value) ? value : {};

  return {
    warrantyActivated: asBoolean(source.warrantyActivated, true),
    ticketCreated: asBoolean(source.ticketCreated, true),
    technicianUpdates: asBoolean(source.technicianUpdates, true),
    claimSubmitted: asBoolean(source.claimSubmitted, true),
    claimDecision: asBoolean(source.claimDecision, true),
    warrantyExpiring: asBoolean(source.warrantyExpiring, true),
    slaBreached: asBoolean(source.slaBreached, true),
  };
}

function normalizeSettings(value: unknown) {
  const source = isRecord(value) ? value : {};
  const sla = isRecord(source.sla) ? source.sla : {};
  const notifications = isRecord(source.notifications) ? source.notifications : {};
  const integrations = isRecord(source.integrations) ? source.integrations : {};

  return {
    sla: {
      responseHoursBySeverity: normalizeSeverityHours(
        sla.responseHoursBySeverity,
      ),
      resolutionHoursBySeverity: normalizeResolutionSeverityHours(
        sla.resolutionHoursBySeverity,
      ),
    },
    notifications: {
      smsEnabled: asBoolean(notifications.smsEnabled, true),
      emailEnabled: asBoolean(notifications.emailEnabled, true),
      whatsappEnabled: asBoolean(notifications.whatsappEnabled, false),
      notifyOnSlaBreach: asBoolean(notifications.notifyOnSlaBreach, true),
      weeklyDigest: asBoolean(notifications.weeklyDigest, false),
      events: normalizeNotificationEvents(notifications.events),
    },
    integrations: {
      erpWebhookUrl: asString(integrations.erpWebhookUrl, ""),
      apiKeyLabel: asString(integrations.apiKeyLabel, ""),
      erpApiKeyMasked: asString(integrations.erpApiKeyMasked, ""),
    },
    stickers: normalizeManufacturerStickerConfig(source),
  };
}

export default async function ManufacturerSettingsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      contactPhone: true,
      address: true,
      city: true,
      state: true,
      country: true,
      pincode: true,
      gstNumber: true,
      logoUrl: true,
      settings: true,
    },
  });

  const manufacturerAdmins = await db.user.findMany({
    where: {
      organizationId,
      role: "manufacturer_admin",
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      name: true,
      email: true,
      clerkId: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!organization) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Manufacturer organization record was not found.
      </div>
    );
  }

  return (
    <ManufacturerSettingsClient
      initialOrganization={{
        id: organization.id,
        name: organization.name,
        contactEmail: organization.contactEmail ?? "",
        contactPhone: organization.contactPhone ?? "",
        address: organization.address ?? "",
        city: organization.city ?? "",
        state: organization.state ?? "",
        country: organization.country ?? "IN",
        pincode: organization.pincode ?? "",
        gstNumber: organization.gstNumber ?? "",
        logoUrl: organization.logoUrl ?? "",
      }}
      initialSettings={normalizeSettings(organization.settings)}
      initialTeamMembers={manufacturerAdmins.map((member) => ({
        id: member.id,
        name: member.name ?? "",
        email: member.email ?? "",
        clerkId: member.clerkId,
        isActive: member.isActive,
        createdAt: member.createdAt.toISOString(),
      }))}
    />
  );
}

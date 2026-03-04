import { db } from "@/lib/db";
import { ManufacturerSettingsClient } from "@/components/manufacturer/settings-client";

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
    low: asNumber(source.low),
    medium: asNumber(source.medium),
    high: asNumber(source.high),
    critical: asNumber(source.critical),
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
      resolutionHoursBySeverity: normalizeSeverityHours(
        sla.resolutionHoursBySeverity,
      ),
    },
    notifications: {
      smsEnabled: asBoolean(notifications.smsEnabled, true),
      emailEnabled: asBoolean(notifications.emailEnabled, true),
      whatsappEnabled: asBoolean(notifications.whatsappEnabled, false),
      notifyOnSlaBreach: asBoolean(notifications.notifyOnSlaBreach, true),
      weeklyDigest: asBoolean(notifications.weeklyDigest, false),
    },
    integrations: {
      erpWebhookUrl: asString(integrations.erpWebhookUrl, ""),
      apiKeyLabel: asString(integrations.apiKeyLabel, ""),
    },
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
      settings: true,
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
      }}
      initialSettings={normalizeSettings(organization.settings)}
    />
  );
}

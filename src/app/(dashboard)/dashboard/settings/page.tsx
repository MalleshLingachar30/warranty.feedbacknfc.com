import { auth } from "@clerk/nextjs/server";

import { ComingSoonCard } from "@/components/dashboard/coming-soon-card";
import { ServiceCenterSettingsClient } from "@/components/service-center/settings-client";
import { db } from "@/lib/db";
import { parseAppRoleFromClaims } from "@/lib/roles";

import { resolveServiceCenterPageContext } from "../_lib/service-center-context";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function normalizeSettings(value: unknown) {
  const source = isRecord(value) ? value : {};
  const notifications = isRecord(source.notifications) ? source.notifications : {};

  return {
    notifications: {
      smsEnabled: asBoolean(notifications.smsEnabled, true),
      emailEnabled: asBoolean(notifications.emailEnabled, true),
      whatsappEnabled: asBoolean(notifications.whatsappEnabled, false),
      notifyOnSlaBreach: asBoolean(notifications.notifyOnSlaBreach, true),
      dailyDigest: asBoolean(notifications.dailyDigest, false),
    },
  };
}

export default async function SettingsPage() {
  const { sessionClaims } = await auth();
  const role = parseAppRoleFromClaims(sessionClaims);

  if (role !== "service_center_admin") {
    return (
      <ComingSoonCard
        title="Settings"
        description="Role-specific settings panels for this dashboard are being expanded."
      />
    );
  }

  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [organization, centers] = await Promise.all([
    db.organization.findUnique({
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
        settings: true,
      },
    }),
    db.serviceCenter.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
        email: true,
        serviceRadiusKm: true,
        supportedCategories: true,
        isActive: true,
      },
    }),
  ]);

  if (!organization) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Service-center organization record was not found.
      </div>
    );
  }

  return (
    <ServiceCenterSettingsClient
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
      }}
      initialSettings={normalizeSettings(organization.settings)}
      initialCenters={centers.map((center) => ({
        id: center.id,
        name: center.name,
        address: center.address ?? "",
        city: center.city ?? "",
        state: center.state ?? "",
        pincode: center.pincode ?? "",
        phone: center.phone ?? "",
        email: center.email ?? "",
        serviceRadiusKm: center.serviceRadiusKm,
        supportedCategories: center.supportedCategories,
        isActive: center.isActive,
      }))}
    />
  );
}

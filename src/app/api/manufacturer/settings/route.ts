import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../_utils";

type SettingsPayload = {
  organization?: unknown;
  sla?: unknown;
  notifications?: unknown;
  integrations?: unknown;
};

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  if (normalized < 0) {
    return null;
  }

  return normalized;
}

function asJsonRecord(value: Prisma.JsonValue): GenericRecord {
  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function normalizeSeverityHours(value: unknown) {
  const source = isRecord(value) ? value : {};

  return {
    low: asPositiveInteger(source.low) ?? 0,
    medium: asPositiveInteger(source.medium) ?? 0,
    high: asPositiveInteger(source.high) ?? 0,
    critical: asPositiveInteger(source.critical) ?? 0,
  };
}

function normalizeNotifications(value: unknown) {
  const source = isRecord(value) ? value : {};

  return {
    smsEnabled: asOptionalBoolean(source.smsEnabled) ?? true,
    emailEnabled: asOptionalBoolean(source.emailEnabled) ?? true,
    whatsappEnabled: asOptionalBoolean(source.whatsappEnabled) ?? false,
    notifyOnSlaBreach: asOptionalBoolean(source.notifyOnSlaBreach) ?? true,
    weeklyDigest: asOptionalBoolean(source.weeklyDigest) ?? false,
  };
}

function normalizeIntegrations(value: unknown) {
  const source = isRecord(value) ? value : {};

  return {
    erpWebhookUrl: asString(source.erpWebhookUrl) ?? "",
    apiKeyLabel: asString(source.apiKeyLabel) ?? "",
  };
}

function normalizeSettings(settings: Prisma.JsonValue) {
  const source = asJsonRecord(settings);

  return {
    sla: {
      responseHoursBySeverity: normalizeSeverityHours(
        isRecord(source.sla) ? source.sla.responseHoursBySeverity : undefined,
      ),
      resolutionHoursBySeverity: normalizeSeverityHours(
        isRecord(source.sla) ? source.sla.resolutionHoursBySeverity : undefined,
      ),
    },
    notifications: normalizeNotifications(source.notifications),
    integrations: normalizeIntegrations(source.integrations),
  };
}

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();

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
      throw new ApiError("Manufacturer organization not found.", 404);
    }

    return NextResponse.json({
      organization: {
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
      },
      settings: normalizeSettings(organization.settings),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<SettingsPayload>(await request.json());

    const organizationPatch = isRecord(body.organization)
      ? body.organization
      : {};
    const slaPatch = isRecord(body.sla) ? body.sla : {};
    const notificationsPatch = isRecord(body.notifications)
      ? body.notifications
      : {};
    const integrationsPatch = isRecord(body.integrations)
      ? body.integrations
      : {};

    const existingOrganization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!existingOrganization) {
      throw new ApiError("Manufacturer organization not found.", 404);
    }

    const existingSettings = normalizeSettings(existingOrganization.settings);
    const nextSettings = {
      sla: {
        responseHoursBySeverity: normalizeSeverityHours(
          slaPatch.responseHoursBySeverity ??
            existingSettings.sla.responseHoursBySeverity,
        ),
        resolutionHoursBySeverity: normalizeSeverityHours(
          slaPatch.resolutionHoursBySeverity ??
            existingSettings.sla.resolutionHoursBySeverity,
        ),
      },
      notifications: normalizeNotifications({
        ...existingSettings.notifications,
        ...notificationsPatch,
      }),
      integrations: normalizeIntegrations({
        ...existingSettings.integrations,
        ...integrationsPatch,
      }),
    };

    const updated = await db.organization.update({
      where: { id: organizationId },
      data: {
        name: asString(organizationPatch.name) ?? undefined,
        contactEmail:
          asString(organizationPatch.contactEmail) ??
          (organizationPatch.contactEmail === "" ? null : undefined),
        contactPhone:
          asString(organizationPatch.contactPhone) ??
          (organizationPatch.contactPhone === "" ? null : undefined),
        address:
          asString(organizationPatch.address) ??
          (organizationPatch.address === "" ? null : undefined),
        city:
          asString(organizationPatch.city) ??
          (organizationPatch.city === "" ? null : undefined),
        state:
          asString(organizationPatch.state) ??
          (organizationPatch.state === "" ? null : undefined),
        country: asString(organizationPatch.country) ?? undefined,
        pincode:
          asString(organizationPatch.pincode) ??
          (organizationPatch.pincode === "" ? null : undefined),
        gstNumber:
          asString(organizationPatch.gstNumber) ??
          (organizationPatch.gstNumber === "" ? null : undefined),
        settings: nextSettings as Prisma.InputJsonValue,
      },
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

    return NextResponse.json({
      organization: {
        id: updated.id,
        name: updated.name,
        contactEmail: updated.contactEmail ?? "",
        contactPhone: updated.contactPhone ?? "",
        address: updated.address ?? "",
        city: updated.city ?? "",
        state: updated.state ?? "",
        country: updated.country ?? "IN",
        pincode: updated.pincode ?? "",
        gstNumber: updated.gstNumber ?? "",
      },
      settings: normalizeSettings(updated.settings),
    });
  } catch (error) {
    return jsonError(error);
  }
}

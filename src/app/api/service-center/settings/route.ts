import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "../_utils";

type GenericRecord = Record<string, unknown>;

const OPERATING_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type OperatingDayKey = (typeof OPERATING_DAYS)[number];

type SettingsPayload = {
  organization?: unknown;
  settings?: unknown;
  centers?: unknown;
};

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

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function sanitizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function normalizeOperatingHours(value: unknown) {
  const source = isRecord(value) ? value : {};

  const result: Record<OperatingDayKey, { enabled: boolean; open: string; close: string }> = {
    mon: { enabled: true, open: "09:00", close: "18:00" },
    tue: { enabled: true, open: "09:00", close: "18:00" },
    wed: { enabled: true, open: "09:00", close: "18:00" },
    thu: { enabled: true, open: "09:00", close: "18:00" },
    fri: { enabled: true, open: "09:00", close: "18:00" },
    sat: { enabled: true, open: "09:00", close: "16:00" },
    sun: { enabled: false, open: "09:00", close: "13:00" },
  };

  for (const day of OPERATING_DAYS) {
    const dayConfig = isRecord(source[day]) ? source[day] : {};

    result[day] = {
      enabled: asOptionalBoolean(dayConfig.enabled) ?? result[day].enabled,
      open: sanitizeTime(dayConfig.open, result[day].open),
      close: sanitizeTime(dayConfig.close, result[day].close),
    };
  }

  return result;
}

function asJsonRecord(value: Prisma.JsonValue): GenericRecord {
  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function normalizeSettings(settings: Prisma.JsonValue) {
  const source = asJsonRecord(settings);
  const notifications = isRecord(source.notifications)
    ? source.notifications
    : {};

  return {
    notifications: {
      smsEnabled: asOptionalBoolean(notifications.smsEnabled) ?? true,
      emailEnabled: asOptionalBoolean(notifications.emailEnabled) ?? true,
      whatsappEnabled: asOptionalBoolean(notifications.whatsappEnabled) ?? false,
      notifyOnSlaBreach:
        asOptionalBoolean(notifications.notifyOnSlaBreach) ?? true,
      dailyDigest: asOptionalBoolean(notifications.dailyDigest) ?? false,
    },
  };
}

export async function GET() {
  try {
    const { organizationId } = await requireServiceCenterContext();

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
          operatingHours: true,
          isActive: true,
        },
      }),
    ]);

    if (!organization) {
      throw new ApiError("Service-center organization not found.", 404);
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
      },
      settings: normalizeSettings(organization.settings),
      centers: centers.map((center) => ({
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
        operatingHours: normalizeOperatingHours(center.operatingHours),
        isActive: center.isActive,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { organizationId } = await requireServiceCenterContext();
    const body = parseJsonBody<SettingsPayload>(await request.json());

    const organizationPatch = isRecord(body.organization)
      ? body.organization
      : {};
    const settingsPatch = isRecord(body.settings) ? body.settings : {};
    const centerPatches = Array.isArray(body.centers) ? body.centers : [];

    const existing = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!existing) {
      throw new ApiError("Service-center organization not found.", 404);
    }

    const currentSettings = normalizeSettings(existing.settings);
    const settingsRecord = isRecord(settingsPatch) ? settingsPatch : {};
    const notificationsPatch = isRecord(settingsRecord.notifications)
      ? settingsRecord.notifications
      : {};

    const nextSettings = {
      notifications: {
        smsEnabled:
          asOptionalBoolean(notificationsPatch.smsEnabled) ??
          currentSettings.notifications.smsEnabled,
        emailEnabled:
          asOptionalBoolean(notificationsPatch.emailEnabled) ??
          currentSettings.notifications.emailEnabled,
        whatsappEnabled:
          asOptionalBoolean(notificationsPatch.whatsappEnabled) ??
          currentSettings.notifications.whatsappEnabled,
        notifyOnSlaBreach:
          asOptionalBoolean(notificationsPatch.notifyOnSlaBreach) ??
          currentSettings.notifications.notifyOnSlaBreach,
        dailyDigest:
          asOptionalBoolean(notificationsPatch.dailyDigest) ??
          currentSettings.notifications.dailyDigest,
      },
    };

    const normalizedCenterPatches = centerPatches
      .map((entry) => (isRecord(entry) ? entry : null))
      .filter((entry): entry is GenericRecord => Boolean(entry))
      .map((entry) => ({
        id: asString(entry.id),
        hasName: "name" in entry,
        hasAddress: "address" in entry,
        hasCity: "city" in entry,
        hasState: "state" in entry,
        hasPincode: "pincode" in entry,
        hasPhone: "phone" in entry,
        hasEmail: "email" in entry,
        hasServiceRadiusKm: "serviceRadiusKm" in entry,
        hasSupportedCategories: "supportedCategories" in entry,
        hasOperatingHours: "operatingHours" in entry,
        hasIsActive: "isActive" in entry,
        name: asString(entry.name),
        address: asString(entry.address),
        city: asString(entry.city),
        state: asString(entry.state),
        pincode: asString(entry.pincode),
        phone: asString(entry.phone),
        email: asString(entry.email),
        serviceRadiusKm: asPositiveInteger(entry.serviceRadiusKm),
        supportedCategories: parseStringArray(entry.supportedCategories),
        operatingHours: normalizeOperatingHours(entry.operatingHours),
        isActive: asOptionalBoolean(entry.isActive),
      }))
      .filter((entry) => Boolean(entry.id));

    await db.$transaction(async (tx) => {
      await tx.organization.update({
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
          settings: nextSettings as Prisma.InputJsonValue,
        },
      });

      for (const patch of normalizedCenterPatches) {
        const centerUpdateData: Prisma.ServiceCenterUpdateManyMutationInput = {};

        if (patch.hasName && patch.name !== null) {
          centerUpdateData.name = patch.name;
        }
        if (patch.hasAddress) {
          centerUpdateData.address = patch.address;
        }
        if (patch.hasCity) {
          centerUpdateData.city = patch.city;
        }
        if (patch.hasState) {
          centerUpdateData.state = patch.state;
        }
        if (patch.hasPincode) {
          centerUpdateData.pincode = patch.pincode;
        }
        if (patch.hasPhone) {
          centerUpdateData.phone = patch.phone;
        }
        if (patch.hasEmail) {
          centerUpdateData.email = patch.email;
        }
        if (patch.hasServiceRadiusKm && patch.serviceRadiusKm !== null) {
          centerUpdateData.serviceRadiusKm = patch.serviceRadiusKm;
        }
        if (patch.hasSupportedCategories) {
          centerUpdateData.supportedCategories = patch.supportedCategories;
        }
        if (patch.hasOperatingHours) {
          centerUpdateData.operatingHours =
            patch.operatingHours as unknown as Prisma.InputJsonValue;
        }
        if (patch.hasIsActive && patch.isActive !== null) {
          centerUpdateData.isActive = patch.isActive;
        }

        await tx.serviceCenter.updateMany({
          where: {
            id: patch.id!,
            organizationId,
          },
          data: centerUpdateData,
        });
      }
    });

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
          operatingHours: true,
          isActive: true,
        },
      }),
    ]);

    if (!organization) {
      throw new ApiError("Service-center organization not found.", 404);
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
      },
      settings: normalizeSettings(organization.settings),
      centers: centers.map((center) => ({
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
        operatingHours: normalizeOperatingHours(center.operatingHours),
        isActive: center.isActive,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

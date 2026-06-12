import { Prisma } from "@prisma/client";

type InstallationGeoLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export const installationReportAuthorizationSelect =
  Prisma.validator<Prisma.InstallationReportSelect>()({
    id: true,
    installationJobId: true,
    assetId: true,
    submittedByRole: true,
    customerName: true,
    customerPhone: true,
    customerEmail: true,
    installAddress: true,
    installCity: true,
    installState: true,
    installPincode: true,
    installationDate: true,
    installerName: true,
    unitSerialNumber: true,
    geoLocation: true,
    customerAcknowledgementType: true,
    customerAcknowledgementPayload: true,
    customerAuthorizedAt: true,
    customerAuthorizedByName: true,
    customerAuthorizedByPhone: true,
    customerAuthorizationPayload: true,
    photoUrls: true,
    checklistResponses: true,
    commissioningData: true,
    submittedAt: true,
    installationJob: {
      select: {
        id: true,
        jobNumber: true,
        status: true,
        manufacturerOrgId: true,
        technicianCompletedAt: true,
        activationTriggeredAt: true,
        manufacturerOrg: {
          select: {
            name: true,
          },
        },
      },
    },
    asset: {
      select: {
        id: true,
        publicCode: true,
        serialNumber: true,
        productModelId: true,
        productModel: {
          select: {
            name: true,
            modelNumber: true,
            warrantyDurationMonths: true,
          },
        },
      },
    },
  });

export type InstallationReportAuthorizationRecord = Prisma.InstallationReportGetPayload<{
  select: typeof installationReportAuthorizationSelect;
}>;

export function formatInstallationReportDateTime(date: Date | null): string {
  if (!date) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatInstallationReportDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function buildInstallationReportNumber(input: {
  submittedAt: Date;
  reportId: string;
}): string {
  const year = input.submittedAt.getFullYear();
  return `IR-${year}-${input.reportId.slice(0, 8).toUpperCase()}`;
}

export function jsonRecordToPairs(
  value: Prisma.JsonValue,
): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([label, rawValue]) => {
      if (typeof rawValue === "string") {
        return {
          label,
          value: rawValue.trim(),
        };
      }

      if (
        typeof rawValue === "number" ||
        typeof rawValue === "boolean" ||
        (rawValue &&
          typeof rawValue === "object" &&
          "toString" in rawValue &&
          typeof rawValue.toString === "function")
      ) {
        return {
          label,
          value: String(rawValue),
        };
      }

      return null;
    })
    .filter(
      (entry): entry is { label: string; value: string } =>
        Boolean(entry && entry.value.length > 0),
    );
}

export function parseInstallationGeoLocation(
  value: Prisma.JsonValue,
): InstallationGeoLocation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const latitude = Number(source.latitude ?? source.lat);
  const longitude = Number(source.longitude ?? source.lng);
  const rawAccuracy = Number(source.accuracy ?? Number.NaN);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(rawAccuracy) ? rawAccuracy : null,
  };
}

export function formatInstallationGeoLocationLabel(
  value: Prisma.JsonValue,
): string | null {
  const location = parseInstallationGeoLocation(value);
  if (!location) {
    return null;
  }

  const coordinates = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  if (location.accuracy === null) {
    return coordinates;
  }

  return `${coordinates} (accuracy ${Math.round(location.accuracy)}m)`;
}

export function buildInstallationGeoLocationUrl(
  value: Prisma.JsonValue,
): string | null {
  const location = parseInstallationGeoLocation(value);
  if (!location) {
    return null;
  }

  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

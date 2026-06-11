import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;
type GenericRecord = Record<string, unknown>;

export type SapDistributorMasterRow = {
  externalDistributorCode: string;
  distributorName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
};

export type SapDistributorImportResult = {
  organizationId: string;
  erpDistributorMasterRecordId: string;
  createdOrganization: boolean;
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "active"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "inactive"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  return null;
}

function readFirstString(
  source: GenericRecord,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

export function normalizeSapDistributorMasterRow(value: unknown): {
  normalized: SapDistributorMasterRow | null;
  errors: string[];
} {
  if (!isRecord(value)) {
    return {
      normalized: null,
      errors: ["Each distributor master row must be a JSON object."],
    };
  }

  const externalDistributorCode = readFirstString(value, [
    "distributorCode",
    "distributor_code",
    "code",
    "customerCode",
    "customer_code",
    "accountCode",
    "account_code",
  ]);

  const distributorName = readFirstString(value, [
    "distributorName",
    "distributor_name",
    "name",
    "customerName",
    "customer_name",
  ]);

  const errors: string[] = [];
  if (!externalDistributorCode) {
    errors.push("Missing distributor code.");
  }
  if (!distributorName) {
    errors.push("Missing distributor name.");
  }

  return {
    normalized:
      externalDistributorCode && distributorName
        ? {
            externalDistributorCode,
            distributorName,
            address: readFirstString(value, ["address", "address1", "line1"]),
            city: readFirstString(value, ["city"]),
            state: readFirstString(value, ["state", "region"]),
            country: readFirstString(value, ["country"]),
            pincode: readFirstString(value, [
              "pincode",
              "pinCode",
              "postalCode",
              "postal_code",
            ]),
            contactName: readFirstString(value, [
              "contactName",
              "contact_name",
              "contactPerson",
              "contact_person",
            ]),
            contactEmail: readFirstString(value, [
              "contactEmail",
              "contact_email",
              "email",
            ]),
            contactPhone: readFirstString(value, [
              "contactPhone",
              "contact_phone",
              "phone",
              "mobile",
            ]),
            isActive:
              asBoolean(value.isActive ?? value.is_active ?? value.active) ?? true,
          }
        : null,
    errors,
  };
}

export async function applySapDistributorMasterRow(
  tx: Tx,
  input: {
    organizationId: string;
    row: SapDistributorMasterRow;
    rawPayload: Prisma.InputJsonValue;
    normalizedPayload: Prisma.InputJsonValue;
    lastRunId?: string | null;
  },
): Promise<SapDistributorImportResult> {
  const existingMappedOrganization = await tx.organization.findFirst({
    where: {
      parentOrganizationId: input.organizationId,
      type: "distributor",
      externalCode: input.row.externalDistributorCode,
    },
    select: {
      id: true,
      settings: true,
    },
  });

  const nextOrganizationSettings = {
    ...(existingMappedOrganization?.settings &&
    typeof existingMappedOrganization.settings === "object" &&
    !Array.isArray(existingMappedOrganization.settings)
      ? (existingMappedOrganization.settings as Record<string, unknown>)
      : {}),
    distributorContactName: input.row.contactName,
    syncSource: "sap",
  } as Prisma.InputJsonValue;

  const mappedOrganization = existingMappedOrganization
    ? await tx.organization.update({
        where: {
          id: existingMappedOrganization.id,
        },
        data: {
          name: input.row.distributorName,
          address: input.row.address,
          city: input.row.city,
          state: input.row.state,
          country: input.row.country ?? "IN",
          pincode: input.row.pincode,
          contactEmail: input.row.contactEmail,
          contactPhone: input.row.contactPhone,
          settings: nextOrganizationSettings,
        },
        select: {
          id: true,
        },
      })
    : await tx.organization.create({
        data: {
          name: input.row.distributorName,
          type: "distributor",
          externalCode: input.row.externalDistributorCode,
          parentOrganizationId: input.organizationId,
          address: input.row.address,
          city: input.row.city,
          state: input.row.state,
          country: input.row.country ?? "IN",
          pincode: input.row.pincode,
          contactEmail: input.row.contactEmail,
          contactPhone: input.row.contactPhone,
          settings: nextOrganizationSettings,
        },
        select: {
          id: true,
        },
      });

  const erpDistributorMasterRecord = await tx.erpDistributorMasterRecord.upsert({
    where: {
      organizationId_externalDistributorCode: {
        organizationId: input.organizationId,
        externalDistributorCode: input.row.externalDistributorCode,
      },
    },
    create: {
      organizationId: input.organizationId,
      externalDistributorCode: input.row.externalDistributorCode,
      distributorName: input.row.distributorName,
      address: input.row.address,
      city: input.row.city,
      state: input.row.state,
      country: input.row.country,
      pincode: input.row.pincode,
      contactName: input.row.contactName,
      contactEmail: input.row.contactEmail,
      contactPhone: input.row.contactPhone,
      isActive: input.row.isActive,
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      mappedOrganizationId: mappedOrganization.id,
      lastRunId: input.lastRunId ?? null,
    },
    update: {
      distributorName: input.row.distributorName,
      address: input.row.address,
      city: input.row.city,
      state: input.row.state,
      country: input.row.country,
      pincode: input.row.pincode,
      contactName: input.row.contactName,
      contactEmail: input.row.contactEmail,
      contactPhone: input.row.contactPhone,
      isActive: input.row.isActive,
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      mappedOrganizationId: mappedOrganization.id,
      lastRunId: input.lastRunId ?? null,
      lastImportedAt: new Date(),
    },
    select: {
      id: true,
    },
  });

  return {
    organizationId: mappedOrganization.id,
    erpDistributorMasterRecordId: erpDistributorMasterRecord.id,
    createdOrganization: !existingMappedOrganization,
  };
}

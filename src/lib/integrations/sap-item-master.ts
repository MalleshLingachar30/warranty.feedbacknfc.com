import { Prisma, type PrismaClient } from "@prisma/client";

import {
  normalizeManufacturerPolicyDefaults,
  normalizeProductModelPolicy,
} from "@/lib/manufacturer-policy";

type Tx = Prisma.TransactionClient | PrismaClient;
type GenericRecord = Record<string, unknown>;

export type SapItemMasterRow = {
  externalItemCode: string;
  externalSeriesCode: string | null;
  itemDescription: string | null;
  category: string | null;
  subCategory: string | null;
  modelNumber: string | null;
  isActive: boolean;
};

export type SapItemMasterImportResult = {
  productModelId: string;
  erpItemMasterRecordId: string;
  createdProductModel: boolean;
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

export function normalizeSapItemMasterRow(value: unknown): {
  normalized: SapItemMasterRow | null;
  errors: string[];
} {
  if (!isRecord(value)) {
    return {
      normalized: null,
      errors: ["Each item master row must be a JSON object."],
    };
  }

  const externalItemCode = readFirstString(value, [
    "itemCode",
    "item_code",
    "code",
    "materialCode",
    "material_code",
    "sku",
  ]);

  const itemDescription = readFirstString(value, [
    "itemDescription",
    "item_description",
    "description",
    "name",
    "materialDescription",
    "material_description",
  ]);

  const normalized: SapItemMasterRow | null = externalItemCode
    ? {
        externalItemCode,
        externalSeriesCode: readFirstString(value, [
          "itemSeriesCode",
          "item_series_code",
          "seriesCode",
          "series_code",
        ]),
        itemDescription,
        category: readFirstString(value, ["category", "itemCategory", "item_category"]),
        subCategory: readFirstString(value, [
          "subCategory",
          "sub_category",
          "itemSubCategory",
          "item_sub_category",
        ]),
        modelNumber: readFirstString(value, [
          "modelNumber",
          "model_number",
          "model",
        ]),
        isActive: asBoolean(
          value.isActive ?? value.is_active ?? value.active ?? value.status,
        ) ?? true,
      }
    : null;

  const errors: string[] = [];
  if (!externalItemCode) {
    errors.push("Missing item code.");
  }

  return {
    normalized,
    errors,
  };
}

function organizationPolicyDefaults(settings: Prisma.JsonValue) {
  if (
    settings &&
    typeof settings === "object" &&
    !Array.isArray(settings) &&
    "policyDefaults" in settings
  ) {
    return normalizeManufacturerPolicyDefaults(
      (settings as GenericRecord).policyDefaults,
    );
  }

  return normalizeManufacturerPolicyDefaults(undefined);
}

function defaultProductModelText(input: SapItemMasterRow) {
  return {
    name:
      input.itemDescription ??
      input.modelNumber ??
      `Imported Item ${input.externalItemCode}`,
    category: input.category ?? "General",
    subCategory: input.subCategory,
    modelNumber: input.modelNumber ?? input.externalItemCode,
    description: input.itemDescription,
  };
}

export async function applySapItemMasterRow(
  tx: Tx,
  input: {
    organizationId: string;
    row: SapItemMasterRow;
    rawPayload: Prisma.InputJsonValue;
    normalizedPayload: Prisma.InputJsonValue;
    lastRunId?: string | null;
  },
): Promise<SapItemMasterImportResult> {
  const organization = await tx.organization.findUnique({
    where: {
      id: input.organizationId,
    },
    select: {
      id: true,
      settings: true,
    },
  });

  if (!organization) {
    throw new Error("Manufacturer organization not found.");
  }

  const defaults = organizationPolicyDefaults(organization.settings);
  const { policy, errors } = normalizeProductModelPolicy({
    payload: {},
    defaults,
  });

  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const text = defaultProductModelText(input.row);

  const existingProductModel = await tx.productModel.findFirst({
    where: {
      organizationId: input.organizationId,
      externalItemCode: input.row.externalItemCode,
    },
    select: {
      id: true,
    },
  });

  const productModel = existingProductModel
    ? await tx.productModel.update({
        where: {
          id: existingProductModel.id,
        },
        data: {
          externalItemSeriesCode: input.row.externalSeriesCode,
          name: text.name,
          category: text.category,
          subCategory: text.subCategory,
          modelNumber: text.modelNumber,
          description: text.description,
        },
        select: {
          id: true,
        },
      })
    : await tx.productModel.create({
        data: {
          organizationId: input.organizationId,
          externalItemCode: input.row.externalItemCode,
          externalItemSeriesCode: input.row.externalSeriesCode,
          name: text.name,
          category: text.category,
          subCategory: text.subCategory,
          modelNumber: text.modelNumber,
          description: text.description,
          warrantyDurationMonths: 12,
          commonIssues: [],
          requiredSkills: [],
          activationMode: policy.activationMode,
          installationOwnershipMode: policy.installationOwnershipMode,
          installationRequired: policy.installationRequired,
          activationTrigger: policy.activationTrigger,
          customerCreationMode: policy.customerCreationMode,
          allowCartonSaleRegistration: policy.allowCartonSaleRegistration,
          allowUnitSelfActivation: policy.allowUnitSelfActivation,
          partTraceabilityMode: policy.partTraceabilityMode,
          smallPartTrackingMode: policy.smallPartTrackingMode,
          customerAcknowledgementRequired:
            policy.customerAcknowledgementRequired,
          installationChecklistTemplate:
            policy.installationChecklistTemplate as Prisma.InputJsonValue,
          commissioningTemplate:
            policy.commissioningTemplate as Prisma.InputJsonValue,
          requiredPhotoPolicy:
            policy.requiredPhotoPolicy as Prisma.InputJsonValue,
          requiredGeoCapture: policy.requiredGeoCapture,
          defaultInstallerSkillTags: policy.defaultInstallerSkillTags,
          includedKitDefinition:
            policy.includedKitDefinition as Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      });

  const erpItemMasterRecord = await tx.erpItemMasterRecord.upsert({
    where: {
      organizationId_externalItemCode: {
        organizationId: input.organizationId,
        externalItemCode: input.row.externalItemCode,
      },
    },
    create: {
      organizationId: input.organizationId,
      externalItemCode: input.row.externalItemCode,
      externalSeriesCode: input.row.externalSeriesCode,
      itemDescription: input.row.itemDescription,
      category: input.row.category,
      subCategory: input.row.subCategory,
      modelNumber: input.row.modelNumber,
      isActive: input.row.isActive,
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      productModelId: productModel.id,
      lastRunId: input.lastRunId ?? null,
    },
    update: {
      externalSeriesCode: input.row.externalSeriesCode,
      itemDescription: input.row.itemDescription,
      category: input.row.category,
      subCategory: input.row.subCategory,
      modelNumber: input.row.modelNumber,
      isActive: input.row.isActive,
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      productModelId: productModel.id,
      lastRunId: input.lastRunId ?? null,
      lastImportedAt: new Date(),
    },
    select: {
      id: true,
    },
  });

  return {
    productModelId: productModel.id,
    erpItemMasterRecordId: erpItemMasterRecord.id,
    createdProductModel: !existingProductModel,
  };
}

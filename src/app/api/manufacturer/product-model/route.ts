import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  normalizeManufacturerPolicyDefaults,
  normalizeProductModelPolicy,
} from "@/lib/manufacturer-policy";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  parseStringArray,
  requireManufacturerContext,
  toNumber,
} from "../_utils";

type ProductModelPayload = {
  name?: unknown;
  category?: unknown;
  subCategory?: unknown;
  modelNumber?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  warrantyDurationMonths?: unknown;
  commonIssues?: unknown;
  requiredSkills?: unknown;
  activationMode?: unknown;
  installationOwnershipMode?: unknown;
  installationRequired?: unknown;
  activationTrigger?: unknown;
  customerCreationMode?: unknown;
  allowCartonSaleRegistration?: unknown;
  allowUnitSelfActivation?: unknown;
  partTraceabilityMode?: unknown;
  smallPartTrackingMode?: unknown;
  customerAcknowledgementRequired?: unknown;
  installationChecklistTemplate?: unknown;
  commissioningTemplate?: unknown;
  requiredPhotoPolicy?: unknown;
  requiredGeoCapture?: unknown;
  defaultInstallerSkillTags?: unknown;
  includedKitDefinition?: unknown;
};

type GenericRecord = Record<string, unknown>;

const FALLBACK_POLICY_DEFAULTS = normalizeManufacturerPolicyDefaults(undefined);

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractPolicyDefaults(settings: unknown) {
  if (!isRecord(settings)) {
    return FALLBACK_POLICY_DEFAULTS;
  }

  return normalizeManufacturerPolicyDefaults(
    isRecord(settings.policyDefaults) ? settings.policyDefaults : undefined,
  );
}

function serializeProductModel(model: {
  id: string;
  name: string;
  category: string;
  subCategory: string | null;
  modelNumber: string | null;
  description: string | null;
  imageUrl: string | null;
  warrantyDurationMonths: number;
  requiredSkills: string[];
  commonIssues: unknown;
  activationMode: string;
  installationOwnershipMode: string;
  installationRequired: boolean;
  activationTrigger: string;
  customerCreationMode: string;
  allowCartonSaleRegistration: boolean;
  allowUnitSelfActivation: boolean;
  partTraceabilityMode: string;
  smallPartTrackingMode: string;
  customerAcknowledgementRequired: boolean;
  installationChecklistTemplate: unknown;
  commissioningTemplate: unknown;
  requiredPhotoPolicy: unknown;
  requiredGeoCapture: boolean;
  defaultInstallerSkillTags: string[];
  includedKitDefinition: unknown;
  createdAt: Date;
  updatedAt: Date;
}, totalUnits = 0) {
  const { policy } = normalizeProductModelPolicy({
    payload: {
      activationMode: model.activationMode,
      installationOwnershipMode: model.installationOwnershipMode,
      installationRequired: model.installationRequired,
      activationTrigger: model.activationTrigger,
      customerCreationMode: model.customerCreationMode,
      allowCartonSaleRegistration: model.allowCartonSaleRegistration,
      allowUnitSelfActivation: model.allowUnitSelfActivation,
      partTraceabilityMode: model.partTraceabilityMode,
      smallPartTrackingMode: model.smallPartTrackingMode,
      customerAcknowledgementRequired: model.customerAcknowledgementRequired,
      installationChecklistTemplate: model.installationChecklistTemplate,
      commissioningTemplate: model.commissioningTemplate,
      requiredPhotoPolicy: model.requiredPhotoPolicy,
      requiredGeoCapture: model.requiredGeoCapture,
      defaultInstallerSkillTags: model.defaultInstallerSkillTags,
      includedKitDefinition: model.includedKitDefinition,
    },
    defaults: FALLBACK_POLICY_DEFAULTS,
  });

  return {
    id: model.id,
    name: model.name,
    category: model.category,
    subCategory: model.subCategory ?? "",
    modelNumber: model.modelNumber ?? "",
    description: model.description ?? "",
    imageUrl: model.imageUrl ?? "",
    warrantyDurationMonths: model.warrantyDurationMonths,
    requiredSkills: model.requiredSkills,
    commonIssues: parseStringArray(model.commonIssues),
    totalUnits,
    activationMode: policy.activationMode,
    installationOwnershipMode: policy.installationOwnershipMode,
    installationRequired: policy.installationRequired,
    activationTrigger: policy.activationTrigger,
    customerCreationMode: policy.customerCreationMode,
    allowCartonSaleRegistration: policy.allowCartonSaleRegistration,
    allowUnitSelfActivation: policy.allowUnitSelfActivation,
    partTraceabilityMode: policy.partTraceabilityMode,
    smallPartTrackingMode: policy.smallPartTrackingMode,
    customerAcknowledgementRequired: policy.customerAcknowledgementRequired,
    installationChecklistTemplate: policy.installationChecklistTemplate,
    commissioningTemplate: policy.commissioningTemplate,
    requiredPhotoPolicy: policy.requiredPhotoPolicy,
    requiredGeoCapture: policy.requiredGeoCapture,
    defaultInstallerSkillTags: policy.defaultInstallerSkillTags,
    includedKitDefinition: policy.includedKitDefinition,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();

    const models = await db.productModel.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        category: true,
        subCategory: true,
        modelNumber: true,
        description: true,
        imageUrl: true,
        warrantyDurationMonths: true,
        requiredSkills: true,
        commonIssues: true,
        activationMode: true,
        installationOwnershipMode: true,
        installationRequired: true,
        activationTrigger: true,
        customerCreationMode: true,
        allowCartonSaleRegistration: true,
        allowUnitSelfActivation: true,
        partTraceabilityMode: true,
        smallPartTrackingMode: true,
        customerAcknowledgementRequired: true,
        installationChecklistTemplate: true,
        commissioningTemplate: true,
        requiredPhotoPolicy: true,
        requiredGeoCapture: true,
        defaultInstallerSkillTags: true,
        includedKitDefinition: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    return NextResponse.json({
      models: models.map((model) =>
        serializeProductModel(model, model._count.products),
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<ProductModelPayload>(await request.json());

    const name = asString(body.name);
    const category = asString(body.category);
    const modelNumber = asString(body.modelNumber);

    if (!name) {
      throw new ApiError("Product model name is required.", 400);
    }

    if (!category) {
      throw new ApiError("Product category is required.", 400);
    }

    if (!modelNumber) {
      throw new ApiError("Model number is required.", 400);
    }

    const warrantyDurationMonths = toNumber(body.warrantyDurationMonths) ?? 12;
    if (
      !Number.isInteger(warrantyDurationMonths) ||
      warrantyDurationMonths < 1
    ) {
      throw new ApiError("Warranty duration must be a positive integer.", 400);
    }

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!organization) {
      throw new ApiError("Manufacturer organization not found.", 404);
    }

    const policyDefaults = extractPolicyDefaults(organization.settings);
    const { policy, errors } = normalizeProductModelPolicy({
      payload: body,
      defaults: policyDefaults,
    });

    if (errors.length > 0) {
      throw new ApiError(errors[0], 400);
    }

    const createdModel = await db.productModel.create({
      data: {
        organizationId,
        name,
        category,
        subCategory: asString(body.subCategory) || null,
        modelNumber,
        description: asString(body.description) || null,
        imageUrl: asString(body.imageUrl) || null,
        warrantyDurationMonths,
        commonIssues: parseStringArray(body.commonIssues),
        requiredSkills: parseStringArray(body.requiredSkills),
        activationMode: policy.activationMode,
        installationOwnershipMode: policy.installationOwnershipMode,
        installationRequired: policy.installationRequired,
        activationTrigger: policy.activationTrigger,
        customerCreationMode: policy.customerCreationMode,
        allowCartonSaleRegistration: policy.allowCartonSaleRegistration,
        allowUnitSelfActivation: policy.allowUnitSelfActivation,
        partTraceabilityMode: policy.partTraceabilityMode,
        smallPartTrackingMode: policy.smallPartTrackingMode,
        customerAcknowledgementRequired: policy.customerAcknowledgementRequired,
        installationChecklistTemplate:
          policy.installationChecklistTemplate as Prisma.InputJsonValue,
        commissioningTemplate:
          policy.commissioningTemplate as Prisma.InputJsonValue,
        requiredPhotoPolicy: policy.requiredPhotoPolicy as Prisma.InputJsonValue,
        requiredGeoCapture: policy.requiredGeoCapture,
        defaultInstallerSkillTags: policy.defaultInstallerSkillTags,
        includedKitDefinition:
          policy.includedKitDefinition as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        category: true,
        subCategory: true,
        modelNumber: true,
        description: true,
        imageUrl: true,
        warrantyDurationMonths: true,
        requiredSkills: true,
        commonIssues: true,
        activationMode: true,
        installationOwnershipMode: true,
        installationRequired: true,
        activationTrigger: true,
        customerCreationMode: true,
        allowCartonSaleRegistration: true,
        allowUnitSelfActivation: true,
        partTraceabilityMode: true,
        smallPartTrackingMode: true,
        customerAcknowledgementRequired: true,
        installationChecklistTemplate: true,
        commissioningTemplate: true,
        requiredPhotoPolicy: true,
        requiredGeoCapture: true,
        defaultInstallerSkillTags: true,
        includedKitDefinition: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const totalUnits = await db.product.count({
      where: {
        productModelId: createdModel.id,
      },
    });

    return NextResponse.json(
      {
        model: serializeProductModel(createdModel, totalUnits),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

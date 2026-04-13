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
} from "../../_utils";

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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const { id } = await params;
    const body = parseJsonBody<ProductModelPayload>(await request.json());

    if (!id) {
      throw new ApiError("Product model id is required.", 400);
    }

    const existingModel = await db.productModel.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
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
        organization: {
          select: {
            settings: true,
          },
        },
      },
    });

    if (!existingModel) {
      throw new ApiError("Product model not found.", 404);
    }

    const name = asString(body.name);
    const category = asString(body.category);
    const modelNumber = asString(body.modelNumber);

    if (!name || !category || !modelNumber) {
      throw new ApiError("Name, category, and model number are required.", 400);
    }

    const warrantyDurationMonths = toNumber(body.warrantyDurationMonths) ?? 12;
    if (
      !Number.isInteger(warrantyDurationMonths) ||
      warrantyDurationMonths < 1
    ) {
      throw new ApiError("Warranty duration must be a positive integer.", 400);
    }

    const policyDefaults = extractPolicyDefaults(existingModel.organization.settings);
    const { policy: baselinePolicy } = normalizeProductModelPolicy({
      payload: {
        activationMode: existingModel.activationMode,
        installationOwnershipMode: existingModel.installationOwnershipMode,
        installationRequired: existingModel.installationRequired,
        activationTrigger: existingModel.activationTrigger,
        customerCreationMode: existingModel.customerCreationMode,
        allowCartonSaleRegistration: existingModel.allowCartonSaleRegistration,
        allowUnitSelfActivation: existingModel.allowUnitSelfActivation,
        partTraceabilityMode: existingModel.partTraceabilityMode,
        smallPartTrackingMode: existingModel.smallPartTrackingMode,
        customerAcknowledgementRequired:
          existingModel.customerAcknowledgementRequired,
        installationChecklistTemplate:
          existingModel.installationChecklistTemplate,
        commissioningTemplate: existingModel.commissioningTemplate,
        requiredPhotoPolicy: existingModel.requiredPhotoPolicy,
        requiredGeoCapture: existingModel.requiredGeoCapture,
        defaultInstallerSkillTags: existingModel.defaultInstallerSkillTags,
        includedKitDefinition: existingModel.includedKitDefinition,
      },
      defaults: policyDefaults,
    });

    const { policy, errors } = normalizeProductModelPolicy({
      payload: body,
      defaults: policyDefaults,
      existing: baselinePolicy,
    });

    if (errors.length > 0) {
      throw new ApiError(errors[0], 400);
    }

    const updated = await db.productModel.update({
      where: { id },
      data: {
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
        productModelId: updated.id,
      },
    });

    return NextResponse.json({ model: serializeProductModel(updated, totalUnits) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const { id } = await params;

    if (!id) {
      throw new ApiError("Product model id is required.", 400);
    }

    const existingModel = await db.productModel.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        _count: {
          select: {
            products: true,
            stickerAllocations: true,
          },
        },
      },
    });

    if (!existingModel) {
      throw new ApiError("Product model not found.", 404);
    }

    if (existingModel._count.products > 0) {
      throw new ApiError(
        "Cannot delete this model because products are already linked to it.",
        409,
      );
    }

    if (existingModel._count.stickerAllocations > 0) {
      throw new ApiError(
        "Cannot delete this model because sticker allocations reference it.",
        409,
      );
    }

    await db.productModel.delete({
      where: { id: existingModel.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot delete this model because it is referenced by existing records.",
        },
        { status: 409 },
      );
    }

    return jsonError(error);
  }
}

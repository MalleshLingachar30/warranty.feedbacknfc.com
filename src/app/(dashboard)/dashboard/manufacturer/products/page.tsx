import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { type ManufacturerProductModel } from "@/components/manufacturer/types";
import { db } from "@/lib/db";
import { normalizeManufacturerPolicyDefaults } from "@/lib/manufacturer-policy";
import { productCatalogSeed } from "@/lib/mock/manufacturer-dashboard";

import {
  jsonStringArray,
  resolveManufacturerPageContext,
} from "../_lib/server-context";

const ProductModelsClient = dynamic(
  () =>
    import("@/components/manufacturer/product-models-client").then(
      (mod) => mod.ProductModelsClient,
    ),
  {
    loading: () => <ClientPageLoading rows={6} />,
  },
);

function seedToProductModel(): ManufacturerProductModel[] {
  return productCatalogSeed.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    subCategory: item.subCategory,
    modelNumber: item.modelNumber,
    description: item.description,
    imageUrl: item.imageUrl,
    warrantyDurationMonths: item.warrantyDurationMonths,
    totalUnits: item.totalUnits,
    commonIssues: item.commonIssues,
    requiredSkills: item.requiredSkills,
    activationMode: item.activationMode,
    installationOwnershipMode: item.installationOwnershipMode,
    installationRequired: item.installationRequired,
    activationTrigger: item.activationTrigger,
    customerCreationMode: item.customerCreationMode,
    allowCartonSaleRegistration: item.allowCartonSaleRegistration,
    allowUnitSelfActivation: item.allowUnitSelfActivation,
    partTraceabilityMode: item.partTraceabilityMode,
    smallPartTrackingMode: item.smallPartTrackingMode,
    customerAcknowledgementRequired: item.customerAcknowledgementRequired,
    installationChecklistTemplate: item.installationChecklistTemplate,
    commissioningTemplate: item.commissioningTemplate,
    requiredPhotoPolicy: item.requiredPhotoPolicy,
    requiredGeoCapture: item.requiredGeoCapture,
    defaultInstallerSkillTags: item.defaultInstallerSkillTags,
    includedKitDefinition: item.includedKitDefinition,
  }));
}

export default async function ManufacturerProductsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  let models: ManufacturerProductModel[] = [];
  let initialPolicyDefaults = normalizeManufacturerPolicyDefaults(undefined);

  if (organizationId) {
    const [rows, organization] = await Promise.all([
      db.productModel.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
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
          commonIssues: true,
          requiredSkills: true,
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
      }),
      db.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          settings: true,
        },
      }),
    ]);

    initialPolicyDefaults = normalizeManufacturerPolicyDefaults(
      organization &&
        typeof organization.settings === "object" &&
        organization.settings !== null &&
        "policyDefaults" in organization.settings
        ? (organization.settings as Record<string, unknown>).policyDefaults
        : undefined,
    );

    models = rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      subCategory: row.subCategory ?? "",
      modelNumber: row.modelNumber ?? "",
      description: row.description ?? "",
      imageUrl: row.imageUrl ?? "",
      warrantyDurationMonths: row.warrantyDurationMonths,
      totalUnits: row._count.products,
      commonIssues: jsonStringArray(row.commonIssues),
      requiredSkills: row.requiredSkills,
      activationMode: row.activationMode,
      installationOwnershipMode: row.installationOwnershipMode,
      installationRequired: row.installationRequired,
      activationTrigger: row.activationTrigger,
      customerCreationMode: row.customerCreationMode,
      allowCartonSaleRegistration: row.allowCartonSaleRegistration,
      allowUnitSelfActivation: row.allowUnitSelfActivation,
      partTraceabilityMode: row.partTraceabilityMode,
      smallPartTrackingMode: row.smallPartTrackingMode,
      customerAcknowledgementRequired: row.customerAcknowledgementRequired,
      installationChecklistTemplate: jsonStringArray(
        row.installationChecklistTemplate,
      ),
      commissioningTemplate: jsonStringArray(row.commissioningTemplate),
      requiredPhotoPolicy:
        typeof row.requiredPhotoPolicy === "object" &&
        row.requiredPhotoPolicy !== null
          ? (row.requiredPhotoPolicy as ManufacturerProductModel["requiredPhotoPolicy"])
          : {
              requireBeforePhoto: false,
              requireAfterPhoto: false,
              minimumPhotoCount: 0,
            },
      requiredGeoCapture: row.requiredGeoCapture,
      defaultInstallerSkillTags: row.defaultInstallerSkillTags,
      includedKitDefinition:
        typeof row.includedKitDefinition === "object" &&
        row.includedKitDefinition !== null
          ? (row.includedKitDefinition as Record<string, unknown>)
          : {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  if (models.length === 0) {
    models = seedToProductModel();
  }

  return (
    <ProductModelsClient
      initialModels={models}
      initialPolicyDefaults={initialPolicyDefaults}
    />
  );
}

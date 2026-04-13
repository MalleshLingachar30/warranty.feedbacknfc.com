import dynamic from "next/dynamic";
import { type Prisma } from "@prisma/client";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import {
  type ManufacturerProductModel,
  type TagGenerationBatchRow,
  type TagGenerationSummary,
} from "@/components/manufacturer/types";
import { db } from "@/lib/db";
import {
  asTagSymbology,
  formatTagGenerationBatchCode,
  type TagSymbology,
} from "@/lib/asset-generation";

import { jsonStringArray, resolveManufacturerPageContext } from "../_lib/server-context";

const StickerWizardClient = dynamic(
  () =>
    import("@/components/manufacturer/sticker-wizard-client").then(
      (mod) => mod.StickerWizardClient,
    ),
  {
    loading: () => <ClientPageLoading rows={7} />,
  },
);

export default async function ManufacturerStickersPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  let productModels: ManufacturerProductModel[] = [];
  let batches: TagGenerationBatchRow[] = [];
  let summary: TagGenerationSummary = {
    totalBatches: 0,
    totalAssets: 0,
    totalTags: 0,
    qrTags: 0,
    dataMatrixTags: 0,
    nfcTags: 0,
  };

  if (organizationId) {
    const [
      models,
      generationBatches,
      totalBatches,
      totalAssets,
      totalTags,
      symbologyCounts,
    ] = await Promise.all([
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
      }),
      db.tagGenerationBatch.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          createdAt: true,
          productClass: true,
          quantity: true,
          serialPrefix: true,
          serialStart: true,
          serialEnd: true,
          includeCartonRegistrationTags: true,
          defaultSymbology: true,
          outputProfile: true,
          productModel: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              assets: true,
              tags: true,
            },
          },
        },
        take: 30,
      }),
      db.tagGenerationBatch.count({
        where: {
          organizationId,
        },
      }),
      db.assetIdentity.count({
        where: {
          organizationId,
        },
      }),
      db.assetTag.count({
        where: {
          generationBatch: {
            organizationId,
          },
        },
      }),
      db.assetTag.groupBy({
        by: ["symbology"],
        where: {
          generationBatch: {
            organizationId,
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    productModels = models.map((model) => ({
      id: model.id,
      name: model.name,
      category: model.category,
      subCategory: model.subCategory ?? "",
      modelNumber: model.modelNumber ?? "",
      description: model.description ?? "",
      imageUrl: model.imageUrl ?? "",
      warrantyDurationMonths: model.warrantyDurationMonths,
      totalUnits: model._count.products,
      commonIssues: jsonStringArray(model.commonIssues),
      requiredSkills: model.requiredSkills,
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
      installationChecklistTemplate: jsonStringArray(
        model.installationChecklistTemplate,
      ),
      commissioningTemplate: jsonStringArray(model.commissioningTemplate),
      requiredPhotoPolicy: model.requiredPhotoPolicy as {
        requireBeforePhoto: boolean;
        requireAfterPhoto: boolean;
        minimumPhotoCount: number;
      },
      requiredGeoCapture: model.requiredGeoCapture,
      defaultInstallerSkillTags: model.defaultInstallerSkillTags,
      includedKitDefinition:
        (model.includedKitDefinition as Record<string, unknown>) ?? {},
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
    }));

    const symbologyMap = new Map<TagSymbology, number>();
    for (const row of symbologyCounts) {
      symbologyMap.set(row.symbology, row._count._all);
    }

    const batchIds = generationBatches.map((batch) => batch.id);
    const batchSymbologyCounts =
      batchIds.length === 0
        ? []
        : await db.assetTag.groupBy({
            by: ["generationBatchId", "symbology"],
            where: {
              generationBatchId: {
                in: batchIds,
              },
            },
            _count: {
              _all: true,
            },
          });

    const batchSymbologyMap = new Map<
      string,
      Partial<Record<TagSymbology, number>>
    >();
    for (const row of batchSymbologyCounts) {
      if (!row.generationBatchId) {
        continue;
      }
      const current = batchSymbologyMap.get(row.generationBatchId) ?? {};
      current[row.symbology] = row._count._all;
      batchSymbologyMap.set(row.generationBatchId, current);
    }

    function parseOutputSymbologies(
      outputProfile: Prisma.JsonValue,
      fallback: TagSymbology,
    ) {
      if (!outputProfile || typeof outputProfile !== "object") {
        return [fallback];
      }

      const profile = outputProfile as Record<string, unknown>;
      if (!Array.isArray(profile.symbologies)) {
        return [fallback];
      }

      const values = profile.symbologies
        .map((entry) => asTagSymbology(entry))
        .filter((value): value is TagSymbology => Boolean(value));

      return values.length > 0 ? values : [fallback];
    }

    batches = generationBatches.map((batch) => ({
      id: batch.id,
      batchCode: formatTagGenerationBatchCode(batch.id, batch.createdAt),
      createdAt: batch.createdAt.toISOString(),
      productClass: batch.productClass,
      quantity: batch.quantity,
      serialPrefix: batch.serialPrefix,
      serialStart: batch.serialStart,
      serialEnd: batch.serialEnd,
      includeCartonRegistrationTags: batch.includeCartonRegistrationTags,
      defaultSymbology: batch.defaultSymbology,
      symbologies: parseOutputSymbologies(
        batch.outputProfile as Prisma.JsonValue,
        batch.defaultSymbology,
      ),
      productModel: {
        id: batch.productModel.id,
        name: batch.productModel.name,
      },
      assetsGenerated: batch._count.assets,
      tagsGenerated: batch._count.tags,
      tagCountBySymbology: batchSymbologyMap.get(batch.id) ?? {},
    }));

    summary = {
      totalBatches,
      totalAssets,
      totalTags,
      qrTags: symbologyMap.get("qr") ?? 0,
      dataMatrixTags: symbologyMap.get("data_matrix") ?? 0,
      nfcTags: symbologyMap.get("nfc_uri") ?? 0,
    };
  }

  return (
    <StickerWizardClient
      initialProductModels={productModels}
      initialBatches={batches}
      initialSummary={summary}
    />
  );
}

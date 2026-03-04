import { StickerWizardClient } from "@/components/manufacturer/sticker-wizard-client";
import {
  type AllocationHistoryRow,
  type ManufacturerProductModel,
  type StickerInventorySummary,
} from "@/components/manufacturer/types";
import { db } from "@/lib/db";
import {
  allocationHistorySeed,
  productCatalogSeed,
  stickerInventorySeed,
} from "@/lib/mock/manufacturer-dashboard";

import {
  buildAllocationDisplayId,
  jsonStringArray,
  resolveManufacturerPageContext,
} from "../_lib/server-context";

function mapSeedModels(): ManufacturerProductModel[] {
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
  }));
}

function mapSeedHistory(): AllocationHistoryRow[] {
  return allocationHistorySeed.map((entry) => {
    const productModel = productCatalogSeed.find(
      (model) => model.id === entry.productModelId,
    );

    return {
      id: entry.id,
      allocationId: entry.allocationId,
      date: entry.date,
      stickerStart: entry.stickerStart,
      stickerEnd: entry.stickerEnd,
      serialPrefix: entry.serialPrefix,
      serialStart: entry.serialStart,
      serialEnd: entry.serialEnd,
      productModelId: entry.productModelId,
      productModelName: productModel?.name ?? "Unknown Model",
      count: entry.stickerEnd - entry.stickerStart + 1,
    };
  });
}

function mapSeedInventory(): StickerInventorySummary {
  return {
    totalAllocated: stickerInventorySeed.totalAllocated,
    totalBound: stickerInventorySeed.totalBound,
    totalActivated: stickerInventorySeed.totalActivated,
    totalAvailable: stickerInventorySeed.totalAvailable,
  };
}

export default async function ManufacturerStickersPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  let productModels: ManufacturerProductModel[] = [];
  let allocationHistory: AllocationHistoryRow[] = [];
  let inventory: StickerInventorySummary = {
    totalAllocated: 0,
    totalBound: 0,
    totalActivated: 0,
    totalAvailable: 0,
  };

  if (organizationId) {
    const [models, allocations, totalAllocated, totalBound, totalActivated] =
      await Promise.all([
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
            _count: {
              select: {
                products: true,
              },
            },
          },
        }),
        db.stickerAllocation.findMany({
          where: {
            organizationId,
          },
          orderBy: {
            allocatedAt: "desc",
          },
          include: {
            productModel: {
              select: {
                name: true,
              },
            },
          },
          take: 30,
        }),
        db.sticker.count({
          where: {
            allocatedToOrgId: organizationId,
          },
        }),
        db.sticker.count({
          where: {
            allocatedToOrgId: organizationId,
            status: "bound",
          },
        }),
        db.sticker.count({
          where: {
            allocatedToOrgId: organizationId,
            status: "activated",
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
    }));

    allocationHistory = allocations.map((allocation) => {
      const serialStartNumber = Number(allocation.applianceSerialStart ?? 0);
      const serialEndNumber = Number(allocation.applianceSerialEnd ?? 0);

      return {
        id: allocation.id,
        allocationId: buildAllocationDisplayId(
          allocation.id,
          allocation.allocatedAt,
        ),
        date: allocation.allocatedAt.toISOString(),
        stickerStart: allocation.stickerStartNumber,
        stickerEnd: allocation.stickerEndNumber,
        serialPrefix: allocation.applianceSerialPrefix ?? "",
        serialStart: Number.isFinite(serialStartNumber) ? serialStartNumber : 0,
        serialEnd: Number.isFinite(serialEndNumber) ? serialEndNumber : 0,
        productModelId: allocation.productModelId ?? "",
        productModelName: allocation.productModel?.name ?? "Unknown Model",
        count: allocation.totalCount,
      };
    });

    inventory = {
      totalAllocated,
      totalBound,
      totalActivated,
      totalAvailable: Math.max(totalAllocated - totalBound - totalActivated, 0),
    };
  }

  if (productModels.length === 0) {
    productModels = mapSeedModels();
  }

  if (allocationHistory.length === 0) {
    allocationHistory = mapSeedHistory();
  }

  if (inventory.totalAllocated === 0 && inventory.totalBound === 0) {
    inventory = mapSeedInventory();
  }

  return (
    <StickerWizardClient
      initialProductModels={productModels}
      initialAllocationHistory={allocationHistory}
      initialInventory={inventory}
    />
  );
}

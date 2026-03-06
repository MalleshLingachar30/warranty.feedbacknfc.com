import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import {
  type AllocationHistoryRow,
  type ManufacturerProductModel,
  type StickerInventorySummary,
} from "@/components/manufacturer/types";
import { db } from "@/lib/db";
import { normalizeManufacturerStickerConfig } from "@/lib/sticker-config";

import {
  buildAllocationDisplayId,
  jsonStringArray,
  resolveManufacturerPageContext,
} from "../_lib/server-context";

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
  let allocationHistory: AllocationHistoryRow[] = [];
  let stickerConfig = normalizeManufacturerStickerConfig({});
  let inventory: StickerInventorySummary = {
    totalAllocated: 0,
    totalBound: 0,
    totalActivated: 0,
    totalAvailable: 0,
  };
  let hasRealAllocations = false;

  if (organizationId) {
    const [
      models,
      allocations,
      totalAllocated,
      totalBound,
      totalActivated,
      organization,
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
      db.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
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

    hasRealAllocations = allocations.length > 0;

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

    stickerConfig = normalizeManufacturerStickerConfig(
      organization?.settings ?? {},
    );
  }

  return (
    <StickerWizardClient
      initialProductModels={productModels}
      initialAllocationHistory={allocationHistory}
      initialInventory={inventory}
      stickerConfig={stickerConfig}
      hasRealAllocations={hasRealAllocations}
    />
  );
}

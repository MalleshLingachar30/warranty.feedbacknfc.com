import { ProductModelsClient } from "@/components/manufacturer/product-models-client";
import { type ManufacturerProductModel } from "@/components/manufacturer/types";
import { db } from "@/lib/db";
import { productCatalogSeed } from "@/lib/mock/manufacturer-dashboard";

import {
  jsonStringArray,
  resolveManufacturerPageContext,
} from "../_lib/server-context";

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
  }));
}

export default async function ManufacturerProductsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  let models: ManufacturerProductModel[] = [];

  if (organizationId) {
    const rows = await db.productModel.findMany({
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
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  if (models.length === 0) {
    models = seedToProductModel();
  }

  return <ProductModelsClient initialModels={models} />;
}

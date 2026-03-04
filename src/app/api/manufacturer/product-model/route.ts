import { NextResponse } from "next/server";

import { db } from "@/lib/db";

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
};

function parseCommonIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
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
  createdAt: Date;
  updatedAt: Date;
  _count: {
    products: number;
  };
}) {
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
    commonIssues: parseCommonIssues(model.commonIssues),
    totalUnits: model._count.products,
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
      models: models.map(serializeProductModel),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<ProductModelPayload>(await request.json());

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const category =
      typeof body.category === "string" ? body.category.trim() : "";
    const modelNumber =
      typeof body.modelNumber === "string" ? body.modelNumber.trim() : "";

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

    const createdModel = await db.productModel.create({
      data: {
        organizationId,
        name,
        category,
        subCategory:
          typeof body.subCategory === "string" &&
          body.subCategory.trim().length > 0
            ? body.subCategory.trim()
            : null,
        modelNumber,
        description:
          typeof body.description === "string" &&
          body.description.trim().length > 0
            ? body.description.trim()
            : null,
        imageUrl:
          typeof body.imageUrl === "string" && body.imageUrl.trim().length > 0
            ? body.imageUrl.trim()
            : null,
        warrantyDurationMonths,
        commonIssues: parseStringArray(body.commonIssues),
        requiredSkills: parseStringArray(body.requiredSkills),
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
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        model: serializeProductModel(createdModel),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

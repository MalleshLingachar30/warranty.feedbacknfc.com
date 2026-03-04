import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

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
      select: { id: true },
    });

    if (!existingModel) {
      throw new ApiError("Product model not found.", 404);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const category =
      typeof body.category === "string" ? body.category.trim() : "";
    const modelNumber =
      typeof body.modelNumber === "string" ? body.modelNumber.trim() : "";

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

    const updated = await db.productModel.update({
      where: { id },
      data: {
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

    return NextResponse.json({ model: serializeProductModel(updated) });
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

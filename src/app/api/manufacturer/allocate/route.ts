import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { normalizeManufacturerStickerConfig } from "@/lib/sticker-config";

import {
  ApiError,
  formatAllocationId,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
  toNumber,
} from "../_utils";

type AllocatePayload = {
  stickerStartNumber?: unknown;
  stickerEndNumber?: unknown;
  stickerVariant?: unknown;
  productModelId?: unknown;
  serialPrefix?: unknown;
  serialStartNumber?: unknown;
  serialEndNumber?: unknown;
  includeCartonQr?: unknown;
};

const MAX_ALLOCATION_BATCH = 2000;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function buildStickerSerial(stickerNumber: number) {
  return `FNFC-${String(stickerNumber).padStart(6, "0")}`;
}

function buildApplianceSerial(
  prefix: string,
  serialNumber: number,
  padLength: number,
) {
  return `${prefix}${String(serialNumber).padStart(padLength, "0")}`;
}

function formatStickerRangeLabel(numbers: number[]) {
  const sorted = [...numbers].sort((left, right) => left - right);

  if (sorted.length === 0) {
    return "selected range";
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first === last) {
    return `Sticker ${first}`;
  }

  return `Stickers ${first}-${last}`;
}

async function getInventorySummary(organizationId: string) {
  const [totalAllocated, totalBound, totalActivated] = await Promise.all([
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

  return {
    totalAllocated,
    totalBound,
    totalActivated,
    totalAvailable: Math.max(totalAllocated - totalBound - totalActivated, 0),
  };
}

export async function POST(request: Request) {
  let organizationId = "";
  let productModelId = "";
  let stickerStartNumber: number | null = null;
  let stickerEndNumber: number | null = null;
  let serialStartNumber: number | null = null;
  let serialEndNumber: number | null = null;
  let stickerType: ReturnType<typeof normalizeManufacturerStickerConfig>["mode"] =
    "qr_only";
  let stickerVariant: "standard" | "high_temp" | "premium" = "standard";

  try {
    const manufacturerContext = await requireManufacturerContext();
    organizationId = manufacturerContext.organizationId;
    const { dbUserId } = manufacturerContext;
    const body = parseJsonBody<AllocatePayload>(await request.json());

    stickerStartNumber = toNumber(body.stickerStartNumber);
    stickerEndNumber = toNumber(body.stickerEndNumber);
    serialStartNumber = toNumber(body.serialStartNumber);
    serialEndNumber = toNumber(body.serialEndNumber);

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        settings: true,
      },
    });

    const stickerConfig = normalizeManufacturerStickerConfig(
      organization?.settings ?? {},
    );

    stickerType = stickerConfig.mode;
    const defaultVariant =
      stickerType === "nfc_qr" ? "premium" : "standard";

    const rawVariant =
      typeof body.stickerVariant === "string" ? body.stickerVariant.trim() : "";
    const requestedVariant =
      rawVariant === "standard" || rawVariant === "high_temp" || rawVariant === "premium"
        ? rawVariant
        : "";

    stickerVariant = defaultVariant;

    if (stickerType === "qr_only") {
      stickerVariant = requestedVariant === "high_temp" ? "high_temp" : "standard";
    } else if (stickerType === "nfc_qr") {
      stickerVariant = "premium";
    } else {
      stickerVariant = "standard";
    }

    productModelId =
      typeof body.productModelId === "string" ? body.productModelId.trim() : "";
    const serialPrefix =
      typeof body.serialPrefix === "string" ? body.serialPrefix.trim() : "";
    const includeCartonQr = body.includeCartonQr !== false;

    if (
      stickerStartNumber === null ||
      stickerEndNumber === null ||
      serialStartNumber === null ||
      serialEndNumber === null
    ) {
      throw new ApiError(
        "Sticker range and appliance serial range numbers are required.",
        400,
      );
    }

    if (
      !Number.isInteger(stickerStartNumber) ||
      !Number.isInteger(stickerEndNumber) ||
      !Number.isInteger(serialStartNumber) ||
      !Number.isInteger(serialEndNumber)
    ) {
      throw new ApiError("All range values must be integers.", 400);
    }

    if (stickerStartNumber <= 0 || stickerEndNumber <= 0) {
      throw new ApiError("Sticker numbers must be positive integers.", 400);
    }

    if (stickerEndNumber < stickerStartNumber) {
      throw new ApiError(
        "Sticker end number must be greater than or equal to start.",
        400,
      );
    }

    if (serialEndNumber < serialStartNumber) {
      throw new ApiError(
        "Serial end number must be greater than or equal to start.",
        400,
      );
    }

    if (!productModelId) {
      throw new ApiError("Product model is required.", 400);
    }

    if (!isUuid(productModelId)) {
      throw new ApiError(
        "Selected product model is invalid. Refresh the page and choose a real product model.",
        400,
      );
    }

    if (!serialPrefix) {
      throw new ApiError("Serial prefix is required.", 400);
    }

    const resolvedStickerStartNumber = stickerStartNumber;
    const resolvedStickerEndNumber = stickerEndNumber;
    const resolvedSerialStartNumber = serialStartNumber;
    const resolvedSerialEndNumber = serialEndNumber;

    const stickerCount = resolvedStickerEndNumber - resolvedStickerStartNumber + 1;
    const serialCount = resolvedSerialEndNumber - resolvedSerialStartNumber + 1;

    if (stickerCount !== serialCount) {
      throw new ApiError(
        "Sticker count and serial count must match for one-to-one binding.",
        400,
      );
    }

    if (stickerCount > MAX_ALLOCATION_BATCH) {
      throw new ApiError(
        `Maximum ${MAX_ALLOCATION_BATCH} stickers can be allocated in one batch.`,
        400,
      );
    }

    const productModel = await db.productModel.findFirst({
      where: {
        id: productModelId,
        organizationId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!productModel) {
      throw new ApiError("Selected product model was not found.", 404);
    }

    const stickerNumbers = Array.from(
      { length: stickerCount },
      (_, index) => resolvedStickerStartNumber + index,
    );
    const serialPadLength = Math.max(
      String(resolvedSerialStartNumber).length,
      String(resolvedSerialEndNumber).length,
      5,
    );

    const allocation = await db.$transaction(async (tx) => {
      const existingStickers = await tx.sticker.findMany({
        where: {
          stickerNumber: {
            in: stickerNumbers,
          },
        },
        select: {
          id: true,
          stickerNumber: true,
          status: true,
          allocatedToOrgId: true,
        },
      });

      const alreadyAllocatedStickers = existingStickers.filter(
        (sticker) => sticker.allocatedToOrgId !== null,
      );

      if (alreadyAllocatedStickers.length > 0) {
        const conflictLabel = formatStickerRangeLabel(
          alreadyAllocatedStickers.map((sticker) => sticker.stickerNumber),
        );

        throw new ApiError(
          `${conflictLabel} has already been allocated. Sticker numbers are single-use and cannot be allocated again. Use the existing QR download actions if you need to reprint labels.`,
          409,
        );
      }

      const activatedSticker = existingStickers.find(
        (sticker) => sticker.status === "activated",
      );

      if (activatedSticker) {
        throw new ApiError(
          `Sticker ${activatedSticker.stickerNumber} is already activated and cannot be re-bound.`,
          409,
        );
      }

      const existingStickerNumberSet = new Set(
        existingStickers.map((sticker) => sticker.stickerNumber),
      );

      const missingStickerRows = stickerNumbers
        .filter((stickerNumber) => !existingStickerNumberSet.has(stickerNumber))
        .map((stickerNumber) => ({
          stickerNumber,
          stickerSerial: buildStickerSerial(stickerNumber),
          status: "bound" as const,
          allocatedToOrgId: organizationId,
          type: stickerType,
          variant: stickerVariant,
        }));

      if (missingStickerRows.length > 0) {
        await tx.sticker.createMany({
          data: missingStickerRows,
          skipDuplicates: true,
        });
      }

      const allStickers = await tx.sticker.findMany({
        where: {
          stickerNumber: {
            in: stickerNumbers,
          },
        },
        select: {
          id: true,
          stickerNumber: true,
        },
      });

      if (allStickers.length !== stickerNumbers.length) {
        throw new ApiError(
          "Unable to resolve sticker range for allocation.",
          500,
        );
      }

      const stickerIds = allStickers.map((sticker) => sticker.id);

      await tx.sticker.updateMany({
        where: {
          id: {
            in: stickerIds,
          },
        },
        data: {
          allocatedToOrgId: organizationId,
          status: "bound",
          type: stickerType,
          variant: stickerVariant,
        },
      });

      const existingProducts = await tx.product.findMany({
        where: {
          stickerId: {
            in: stickerIds,
          },
        },
        select: {
          stickerId: true,
          serialNumber: true,
          warrantyStatus: true,
          productModelId: true,
          sticker: {
            select: {
              stickerNumber: true,
            },
          },
        },
      });

      // Block re-allocation only when stickers are already bound to the SAME product model.
      // Allocating the same sticker range to a DIFFERENT product model is allowed.
      const sameModelProducts = existingProducts.filter(
        (product) => product.productModelId === productModelId,
      );

      if (sameModelProducts.length > 0) {
        const conflictingStickerNumbers = sameModelProducts.map(
          (product) => product.sticker.stickerNumber,
        );
        const conflictLabel = formatStickerRangeLabel(conflictingStickerNumbers);
        const pendingActivationOnly = sameModelProducts.every(
          (product) => product.warrantyStatus === "pending_activation",
        );

        if (pendingActivationOnly) {
          throw new ApiError(
            `${conflictLabel} is already allocated and bound to ${serialPrefix} product serials. Use the QR download actions to regenerate labels instead of reallocating the same range.`,
            409,
          );
        }

        throw new ApiError(
          `${conflictLabel} is already attached to ${serialPrefix} products with warranty history and cannot be reallocated.`,
          409,
        );
      }

      // Build the serial numbers this allocation would produce and check for duplicates.
      const intendedSerials = stickerNumbers.map((_, index) =>
        buildApplianceSerial(
          serialPrefix,
          resolvedSerialStartNumber + index,
          serialPadLength,
        ),
      );

      const existingSerialProducts = await tx.product.findMany({
        where: {
          organizationId,
          productModelId,
          serialNumber: {
            in: intendedSerials,
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingSerialProducts.length > 0) {
        const duplicateSerials = existingSerialProducts.map(
          (product) => product.serialNumber,
        );
        const label =
          duplicateSerials.length === 1
            ? `Serial ${duplicateSerials[0]}`
            : `Serials ${duplicateSerials[0]}-${duplicateSerials[duplicateSerials.length - 1]}`;

        throw new ApiError(
          `${label} already exists for ${serialPrefix} products. Choose a different serial number range to avoid duplicates.`,
          409,
        );
      }

      const existingProductMap = new Map(
        existingProducts.map((product) => [product.stickerId, product]),
      );

      const stickerByNumber = new Map(
        allStickers.map((sticker) => [sticker.stickerNumber, sticker]),
      );

      const createProducts: Array<{
        id: string;
        stickerId: string;
        productModelId: string;
        organizationId: string;
        serialNumber: string;
        warrantyStatus: "pending_activation";
      }> = [];

      for (let index = 0; index < stickerNumbers.length; index += 1) {
        const stickerNumber = stickerNumbers[index];
        const sticker = stickerByNumber.get(stickerNumber);

        if (!sticker) {
          throw new ApiError(
            "Unable to map stickers to allocation range.",
            500,
          );
        }

        const serialNumber = intendedSerials[index];

        if (!existingProductMap.has(sticker.id)) {
          createProducts.push({
            id: crypto.randomUUID(),
            stickerId: sticker.id,
            productModelId,
            organizationId,
            serialNumber,
            warrantyStatus: "pending_activation",
          });
        }
      }

      if (createProducts.length > 0) {
        await tx.product.createMany({
          data: createProducts,
        });
      }

      return tx.stickerAllocation.create({
        data: {
          organizationId,
          stickerStartNumber: resolvedStickerStartNumber,
          stickerEndNumber: resolvedStickerEndNumber,
          totalCount: stickerCount,
          productModelId,
          allocationType: "bulk_bind",
          applianceSerialPrefix: serialPrefix,
          applianceSerialStart: String(resolvedSerialStartNumber),
          applianceSerialEnd: String(resolvedSerialEndNumber),
          includeCartonQr,
          allocatedById: dbUserId,
          notes: `Bulk allocation for ${productModel.name}`,
        },
        select: {
          id: true,
          allocatedAt: true,
          totalCount: true,
        },
      });
    });

    const inventory = await getInventorySummary(organizationId);

    return NextResponse.json({
      success: true,
      allocation: {
        id: allocation.id,
        allocationId: formatAllocationId(allocation.id, allocation.allocatedAt),
        totalCount: allocation.totalCount,
        includeCartonQr,
      },
      inventory,
    });
  } catch (error) {
    console.error("Manufacturer sticker allocation full error", error);
    console.error("Manufacturer sticker allocation failed", {
      organizationId: organizationId || null,
      productModelId: productModelId || null,
      stickerStartNumber,
      stickerEndNumber,
      serialStartNumber,
      serialEndNumber,
      stickerType,
      stickerVariant,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      prismaCode:
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : null,
      prismaMeta:
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.meta ?? null
          : null,
    });

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return NextResponse.json(
        {
          error:
            "Sticker allocation timed out while rebinding existing units. Please retry, or split very large rebinds into smaller ranges.",
        },
        { status: 503 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2023"
    ) {
      return NextResponse.json(
        {
          error:
            "Allocation request contains an invalid identifier. Refresh the page and select a valid product model.",
        },
        { status: 400 },
      );
    }

    return jsonError(error);
  }
}

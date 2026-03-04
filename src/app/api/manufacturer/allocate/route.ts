import { NextResponse } from "next/server";

import { db } from "@/lib/db";

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
  productModelId?: unknown;
  serialPrefix?: unknown;
  serialStartNumber?: unknown;
  serialEndNumber?: unknown;
};

const MAX_ALLOCATION_BATCH = 2000;

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
  try {
    const { organizationId, dbUserId } = await requireManufacturerContext();
    const body = parseJsonBody<AllocatePayload>(await request.json());

    const stickerStartNumber = toNumber(body.stickerStartNumber);
    const stickerEndNumber = toNumber(body.stickerEndNumber);
    const serialStartNumber = toNumber(body.serialStartNumber);
    const serialEndNumber = toNumber(body.serialEndNumber);

    const productModelId =
      typeof body.productModelId === "string" ? body.productModelId.trim() : "";
    const serialPrefix =
      typeof body.serialPrefix === "string" ? body.serialPrefix.trim() : "";

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

    if (!serialPrefix) {
      throw new ApiError("Serial prefix is required.", 400);
    }

    const stickerCount = stickerEndNumber - stickerStartNumber + 1;
    const serialCount = serialEndNumber - serialStartNumber + 1;

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
      (_, index) => stickerStartNumber + index,
    );
    const serialPadLength = Math.max(
      String(serialStartNumber).length,
      String(serialEndNumber).length,
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
        },
      });

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
          warrantyStatus: true,
        },
      });

      const nonReusableProduct = existingProducts.find(
        (product) => product.warrantyStatus !== "pending_activation",
      );

      if (nonReusableProduct) {
        throw new ApiError(
          "At least one sticker in this range is already attached to a product with warranty history.",
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

      const updatePromises: Array<Promise<unknown>> = [];

      for (let index = 0; index < stickerNumbers.length; index += 1) {
        const stickerNumber = stickerNumbers[index];
        const sticker = stickerByNumber.get(stickerNumber);

        if (!sticker) {
          throw new ApiError(
            "Unable to map stickers to allocation range.",
            500,
          );
        }

        const serialNumber = buildApplianceSerial(
          serialPrefix,
          serialStartNumber + index,
          serialPadLength,
        );

        if (existingProductMap.has(sticker.id)) {
          updatePromises.push(
            tx.product.update({
              where: {
                stickerId: sticker.id,
              },
              data: {
                organizationId,
                productModelId,
                serialNumber,
                warrantyStatus: "pending_activation",
                warrantyStartDate: null,
                warrantyEndDate: null,
                customerId: null,
                customerName: null,
                customerPhone: null,
                customerEmail: null,
                customerAddress: null,
                customerCity: null,
                customerState: null,
                customerPincode: null,
              },
            }),
          );
        } else {
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

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      return tx.stickerAllocation.create({
        data: {
          organizationId,
          stickerStartNumber,
          stickerEndNumber,
          totalCount: stickerCount,
          productModelId,
          allocationType: "bulk_bind",
          applianceSerialPrefix: serialPrefix,
          applianceSerialStart: String(serialStartNumber),
          applianceSerialEnd: String(serialEndNumber),
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
      },
      inventory,
    });
  } catch (error) {
    return jsonError(error);
  }
}

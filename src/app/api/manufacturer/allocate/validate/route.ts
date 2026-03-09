import { NextResponse } from "next/server";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  requireManufacturerContext,
  toNumber,
} from "../../_utils";

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

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const url = new URL(request.url);
    const stickerStartNumber = toNumber(
      url.searchParams.get("stickerStartNumber"),
    );
    const stickerEndNumber = toNumber(url.searchParams.get("stickerEndNumber"));

    if (stickerStartNumber === null || stickerEndNumber === null) {
      throw new ApiError(
        "Sticker start and end numbers are required.",
        400,
      );
    }

    if (
      !Number.isInteger(stickerStartNumber) ||
      !Number.isInteger(stickerEndNumber) ||
      stickerStartNumber <= 0 ||
      stickerEndNumber <= 0 ||
      stickerEndNumber < stickerStartNumber
    ) {
      throw new ApiError("Enter a valid sticker range.", 400);
    }

    const conflictingStickers = await db.sticker.findMany({
      where: {
        stickerNumber: {
          gte: stickerStartNumber,
          lte: stickerEndNumber,
        },
        allocatedToOrgId: {
          not: null,
        },
      },
      orderBy: {
        stickerNumber: "asc",
      },
      select: {
        stickerNumber: true,
        allocatedToOrgId: true,
      },
    });

    if (conflictingStickers.length === 0) {
      return NextResponse.json({
        valid: true,
      });
    }

    const conflictLabel = formatStickerRangeLabel(
      conflictingStickers.map((sticker) => sticker.stickerNumber),
    );
    const belongsToCurrentManufacturer = conflictingStickers.every(
      (sticker) => sticker.allocatedToOrgId === organizationId,
    );

    return NextResponse.json({
      valid: false,
      message: belongsToCurrentManufacturer
        ? `${conflictLabel} has already been allocated. Sticker numbers are single-use and cannot be allocated again. Use the existing QR download actions if you need to reprint labels.`
        : `${conflictLabel} is already allocated to another manufacturer and cannot be used in this batch.`,
      conflictingStickerNumbers: conflictingStickers.map(
        (sticker) => sticker.stickerNumber,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

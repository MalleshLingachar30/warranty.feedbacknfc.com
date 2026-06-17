import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "@/app/api/manufacturer/_utils";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type UpdateReturnStatusRequest = {
  action?: unknown;
  notes?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const manufacturer = await requireManufacturerContext();
    const { id } = await context.params;
    const body = parseJsonBody<UpdateReturnStatusRequest>(await request.json());
    const action = asString(body.action);
    const notes = asString(body.notes);

    if (!id) {
      throw new ApiError("Return id is required.");
    }

    if (action !== "receive_manufacturer" && action !== "close") {
      throw new ApiError("Unsupported return action.");
    }

    const partReturn = await db.ticketPartReturn.findFirst({
      where: {
        id,
        ticket: {
          product: {
            organizationId: manufacturer.organizationId,
          },
        },
      },
      select: {
        id: true,
        ticketId: true,
        returnNumber: true,
        status: true,
        collectionNotes: true,
      },
    });

    if (!partReturn) {
      throw new ApiError("Removed-part return not found for this manufacturer.", 404);
    }

    if (
      action === "receive_manufacturer" &&
      partReturn.status !== "received_at_service_center"
    ) {
      throw new ApiError(
        "Only service-center-received returns can be marked as received by manufacturer.",
        409,
      );
    }

    if (action === "close" && partReturn.status !== "received_by_manufacturer") {
      throw new ApiError(
        "Only manufacturer-received returns can be closed.",
        409,
      );
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      const nextStatus =
        action === "receive_manufacturer"
          ? "received_by_manufacturer"
          : "closed";

      await tx.ticketPartReturn.update({
        where: { id: partReturn.id },
        data: {
          status: nextStatus,
          collectionNotes: notes ?? partReturn.collectionNotes,
          receivedByManufacturerAt:
            action === "receive_manufacturer" ? now : undefined,
          closedAt: action === "close" ? now : undefined,
        },
      });

      const description =
        action === "receive_manufacturer"
          ? `Removed-part return ${partReturn.returnNumber} received by manufacturer/depot.`
          : `Removed-part return ${partReturn.returnNumber} closed by manufacturer/depot.`;

      await tx.ticketTimeline.create({
        data: {
          ticketId: partReturn.ticketId,
          eventType: "removed_part_return_updated",
          eventDescription: description,
          actorUserId: manufacturer.dbUserId,
          actorRole: "manufacturer_admin",
          actorName: "Manufacturer",
          metadata: {
            returnNumber: partReturn.returnNumber,
            action,
            nextStatus,
            notes,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return NextResponse.json({
      success: true,
      returnId: partReturn.id,
      returnNumber: partReturn.returnNumber,
    });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "@/app/api/service-center/_utils";
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
    const serviceCenter = await requireServiceCenterContext();
    const { id } = await context.params;
    const body = parseJsonBody<UpdateReturnStatusRequest>(await request.json());
    const action = asString(body.action);
    const notes = asString(body.notes);

    if (!id) {
      throw new ApiError("Return id is required.");
    }

    if (
      action !== "receive_service_center" &&
      action !== "cancel"
    ) {
      throw new ApiError("Unsupported return action.");
    }

    const partReturn = await db.ticketPartReturn.findFirst({
      where: {
        id,
        serviceCenter: {
          organizationId: serviceCenter.organizationId,
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
      throw new ApiError("Removed-part return not found for this service center.", 404);
    }

    if (
      action === "receive_service_center" &&
      partReturn.status !== "collected_by_technician" &&
      partReturn.status !== "awaiting_collection"
    ) {
      throw new ApiError(
        "Only technician-collected or expected field returns can be marked as received at the service center.",
        409,
      );
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      const nextStatus =
        action === "receive_service_center"
          ? "received_at_service_center"
          : "cancelled";

      await tx.ticketPartReturn.update({
        where: { id: partReturn.id },
        data: {
          status: nextStatus,
          collectionNotes: notes ?? partReturn.collectionNotes,
          collectedAt:
            action === "receive_service_center" &&
            partReturn.status === "awaiting_collection"
              ? now
              : undefined,
          receivedAtServiceCenterAt:
            action === "receive_service_center" ? now : undefined,
          closedAt: action === "cancel" ? now : undefined,
        },
      });

      const description =
        action === "receive_service_center"
          ? `Removed-part return ${partReturn.returnNumber} received at service center.`
          : `Removed-part return ${partReturn.returnNumber} cancelled.`;

      await tx.ticketTimeline.create({
        data: {
          ticketId: partReturn.ticketId,
          eventType: "removed_part_return_updated",
          eventDescription: description,
          actorRole: "service_center_admin",
          actorName: "Service Center",
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

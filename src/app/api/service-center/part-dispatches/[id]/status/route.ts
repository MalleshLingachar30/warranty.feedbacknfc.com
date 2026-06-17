import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "@/app/api/service-center/_utils";
import { db } from "@/lib/db";
import { summarizeDispatchStatus } from "@/lib/ticket-part-logistics";

export const runtime = "nodejs";

type UpdateDispatchStatusRequest = {
  action?: unknown;
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
    const body = parseJsonBody<UpdateDispatchStatusRequest>(await request.json());
    const action = asString(body.action);

    if (!id) {
      throw new ApiError("Dispatch id is required.");
    }

    if (
      action !== "mark_dispatched" &&
      action !== "mark_received_by_technician" &&
      action !== "cancel"
    ) {
      throw new ApiError("Unsupported dispatch action.");
    }

    const dispatch = await db.ticketPartDispatch.findFirst({
      where: {
        id,
        serviceCenter: {
          organizationId: serviceCenter.organizationId,
        },
      },
      select: {
        id: true,
        ticketId: true,
        dispatchNumber: true,
        status: true,
      },
    });

    if (!dispatch) {
      throw new ApiError("Spare dispatch not found for this service center.", 404);
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      const items = await tx.ticketPartDispatchItem.findMany({
        where: {
          dispatchId: dispatch.id,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (action === "mark_dispatched") {
        await tx.ticketPartDispatchItem.updateMany({
          where: {
            dispatchId: dispatch.id,
            status: "planned",
          },
          data: {
            status: "dispatched",
            dispatchedAt: now,
          },
        });
      } else if (action === "mark_received_by_technician") {
        await tx.ticketPartDispatchItem.updateMany({
          where: {
            dispatchId: dispatch.id,
            status: {
              in: ["planned", "dispatched"],
            },
          },
          data: {
            status: "received_by_technician",
            receivedByTechnicianAt: now,
          },
        });
      } else {
        await tx.ticketPartDispatchItem.updateMany({
          where: {
            dispatchId: dispatch.id,
            status: {
              in: ["planned", "dispatched", "received_by_technician"],
            },
          },
          data: {
            status: "cancelled",
          },
        });
      }

      const refreshedItems = await tx.ticketPartDispatchItem.findMany({
        where: {
          dispatchId: dispatch.id,
        },
        select: {
          status: true,
        },
      });
      const nextStatus = summarizeDispatchStatus(
        refreshedItems.map((item) => item.status),
      );

      await tx.ticketPartDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: nextStatus,
          dispatchedAt:
            action === "mark_dispatched" && !["cancelled"].includes(nextStatus)
              ? now
              : undefined,
          receivedByTechnicianAt:
            action === "mark_received_by_technician" ? now : undefined,
          closedAt:
            nextStatus === "cancelled" || nextStatus === "fully_reconciled"
              ? now
              : undefined,
          reconciledAt:
            nextStatus === "partially_reconciled" ||
            nextStatus === "fully_reconciled"
              ? now
              : undefined,
        },
      });

      const description =
        action === "mark_dispatched"
          ? `Spare dispatch ${dispatch.dispatchNumber} marked as dispatched.`
          : action === "mark_received_by_technician"
            ? `Technician receipt confirmed for spare dispatch ${dispatch.dispatchNumber}.`
            : `Spare dispatch ${dispatch.dispatchNumber} was cancelled.`;

      await tx.ticketTimeline.create({
        data: {
          ticketId: dispatch.ticketId,
          eventType: "spares_dispatch_updated",
          eventDescription: description,
          actorRole: "service_center_admin",
          actorName: "Service Center",
          metadata: {
            dispatchNumber: dispatch.dispatchNumber,
            action,
            previousStatuses: items.map((item) => item.status),
            nextStatus,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return NextResponse.json({
      success: true,
      dispatchId: dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
    });
  } catch (error) {
    return jsonError(error);
  }
}

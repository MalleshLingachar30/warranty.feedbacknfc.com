import { NextResponse, type NextRequest } from "next/server";
import { Prisma, type TicketStatus } from "@prisma/client";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "@/app/api/service-center/_utils";
import { db } from "@/lib/db";
import {
  parsePartUsageInputs,
  resolvePartUsages,
} from "@/lib/job-part-usage";
import {
  derivePartNameFromUsage,
  derivePartNumberFromUsage,
  generateTicketPartDispatchNumber,
} from "@/lib/ticket-part-logistics";

export const runtime = "nodejs";

const ALLOWED_TICKET_STATUSES: TicketStatus[] = [
  "awaiting_technician_acceptance",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "reopened",
  "escalated",
];

type DispatchItemInput = {
  catalogPartId?: unknown;
  partName?: unknown;
  partNumber?: unknown;
  assetCode?: unknown;
  tagCode?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
  notes?: unknown;
};

type CreateDispatchRequest = {
  assignedTechnicianId?: unknown;
  notes?: unknown;
  items?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown, fallback = 1): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Number(parsed.toFixed(3));
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const serviceCenter = await requireServiceCenterContext();
    const { id: ticketId } = await context.params;
    const body = parseJsonBody<CreateDispatchRequest>(await request.json());

    if (!ticketId) {
      throw new ApiError("Ticket id is required.");
    }

    if (!serviceCenter.dbUserId) {
      throw new ApiError("Service-center user could not be resolved.");
    }
    const createdByUserId = serviceCenter.dbUserId;

    const itemsInput = Array.isArray(body.items)
      ? (body.items as DispatchItemInput[])
      : [];

    if (itemsInput.length === 0) {
      throw new ApiError("Add at least one spare item to create a dispatch.");
    }

    const ticket = await db.ticket.findFirst({
      where: {
        id: ticketId,
        status: {
          in: ALLOWED_TICKET_STATUSES,
        },
        OR: [
          {
            assignedServiceCenter: {
              organizationId: serviceCenter.organizationId,
            },
          },
          {
            assignedTechnician: {
              serviceCenter: {
                organizationId: serviceCenter.organizationId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        ticketNumber: true,
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
        product: {
          select: {
            organizationId: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new ApiError("Ticket not found for this service-center organization.", 404);
    }

    if (!ticket.assignedServiceCenterId) {
      throw new ApiError("Assign this ticket to a service center before dispatching spares.");
    }

    const assignedTechnicianId =
      asString(body.assignedTechnicianId) ?? ticket.assignedTechnicianId;

    if (assignedTechnicianId) {
      const technician = await db.technician.findFirst({
        where: {
          id: assignedTechnicianId,
          serviceCenter: {
            organizationId: serviceCenter.organizationId,
          },
        },
        select: {
          id: true,
        },
      });

      if (!technician) {
        throw new ApiError("Assigned technician is not part of this service center.");
      }
    }

    const parsedInputs = parsePartUsageInputs({
      value: itemsInput.map((item) => ({
        assetCode: asString(item.assetCode),
        tagCode: asString(item.tagCode),
        partName: asString(item.partName),
        partNumber: asString(item.partNumber),
        catalogPartId: asString(item.catalogPartId),
        unitCost: toNumber(item.unitCost, 0),
        quantity: toNumber(item.quantity, 1),
        usageType: "consumed",
        note: asString(item.notes),
      })),
      defaultUsageType: "consumed",
    });

    if (parsedInputs.length === 0) {
      throw new ApiError("Each dispatch item must include a spare asset or tag code.");
    }

    const created = await db.$transaction(async (tx) => {
      const resolved = await resolvePartUsages(tx, {
        organizationId: ticket.product.organizationId,
        parsedUsages: parsedInputs,
      });

      const dispatchNumber = await generateTicketPartDispatchNumber(tx);
      const dispatch = await tx.ticketPartDispatch.create({
        data: {
          ticketId: ticket.id,
          serviceCenterId: ticket.assignedServiceCenterId!,
          assignedTechnicianId,
          createdByUserId,
          dispatchNumber,
          notes: asString(body.notes),
          metadata: {
            ticketNumber: ticket.ticketNumber,
            creationChannel: "service_center_dashboard",
          } satisfies Prisma.InputJsonValue,
        },
        select: {
          id: true,
          dispatchNumber: true,
        },
      });

      await tx.ticketPartDispatchItem.createMany({
        data: resolved.map((usage) => ({
          dispatchId: dispatch.id,
          catalogPartId: usage.input.catalogPartId,
          partName: derivePartNameFromUsage(usage),
          partNumber: derivePartNumberFromUsage(usage),
          spareAssetId: usage.usedAsset.id,
          spareTagId: usage.usedTag?.id ?? null,
          quantity: usage.input.quantity,
          unitCost: usage.input.unitCost,
          notes: usage.input.note,
          metadata: {
            assetCode: usage.usedAsset.publicCode,
            tagCode: usage.usedTag?.publicCode ?? null,
            requestedUsageType: usage.input.usageType,
          } satisfies Prisma.InputJsonValue,
        })),
      });

      await tx.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          eventType: "spares_dispatch_planned",
          eventDescription: `Spare dispatch ${dispatch.dispatchNumber} planned with ${resolved.length} line item(s).`,
          actorRole: "service_center_admin",
          actorName: "Service Center",
          metadata: {
            dispatchNumber: dispatch.dispatchNumber,
            itemCount: resolved.length,
          } as Prisma.InputJsonValue,
        },
      });

      return dispatch;
    });

    return NextResponse.json({
      success: true,
      dispatchId: created.id,
      dispatchNumber: created.dispatchNumber,
    });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  asOptionalDate,
  asOptionalString,
  asPositiveInteger,
  parsePreventiveMaintenanceEventStatus,
  parsePreventiveMaintenanceEventType,
  preventiveMaintenanceEventSelect,
  serializePreventiveMaintenanceEvent,
} from "@/lib/preventive-maintenance-api";

import { jsonError, requireManufacturerContext } from "../../_utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const url = new URL(request.url);
    const status = parsePreventiveMaintenanceEventStatus(
      url.searchParams.get("status"),
    );
    const eventType = parsePreventiveMaintenanceEventType(
      url.searchParams.get("eventType"),
    );
    const productModelId = asOptionalString(
      url.searchParams.get("productModelId"),
    );
    const assetId = asOptionalString(url.searchParams.get("assetId"));
    const serviceCenterId = asOptionalString(
      url.searchParams.get("serviceCenterId"),
    );
    const technicianId = asOptionalString(url.searchParams.get("technicianId"));
    const dueFrom = asOptionalDate(url.searchParams.get("dueFrom"));
    const dueTo = asOptionalDate(url.searchParams.get("dueTo"));
    const limit = Math.min(
      asPositiveInteger(url.searchParams.get("limit")) ?? 100,
      250,
    );

    const where: Prisma.PreventiveMaintenanceEventWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
      ...(assetId ? { assetId } : {}),
      ...(serviceCenterId ? { assignedServiceCenterId: serviceCenterId } : {}),
      ...(technicianId ? { assignedTechnicianId: technicianId } : {}),
      ...(productModelId
        ? {
            asset: {
              productModelId,
            },
          }
        : {}),
      ...(dueFrom || dueTo
        ? {
            dueDate: {
              ...(dueFrom ? { gte: dueFrom } : {}),
              ...(dueTo ? { lte: dueTo } : {}),
            },
          }
        : {}),
    };

    const events = await db.preventiveMaintenanceEvent.findMany({
      where,
      orderBy: [
        {
          dueDate: "asc",
        },
        {
          eventNumber: "asc",
        },
      ],
      take: limit,
      select: preventiveMaintenanceEventSelect,
    });

    return NextResponse.json({
      events: events.map((event) => serializePreventiveMaintenanceEvent(event)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

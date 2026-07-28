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

import { jsonError, requireServiceCenterContext } from "../../_utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireServiceCenterContext();
    const url = new URL(request.url);
    const status = parsePreventiveMaintenanceEventStatus(
      url.searchParams.get("status"),
    );
    const eventType = parsePreventiveMaintenanceEventType(
      url.searchParams.get("eventType"),
    );
    const technicianId = asOptionalString(url.searchParams.get("technicianId"));
    const dueFrom = asOptionalDate(url.searchParams.get("dueFrom"));
    const dueTo = asOptionalDate(url.searchParams.get("dueTo"));
    const limit = Math.min(
      asPositiveInteger(url.searchParams.get("limit")) ?? 100,
      250,
    );

    const where: Prisma.PreventiveMaintenanceEventWhereInput = {
      assignedServiceCenter: {
        organizationId,
      },
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
      ...(technicianId ? { assignedTechnicianId: technicianId } : {}),
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
          scheduledFor: "asc",
        },
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

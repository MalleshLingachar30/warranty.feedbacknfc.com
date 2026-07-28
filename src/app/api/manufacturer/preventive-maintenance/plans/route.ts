import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { normalizePreventiveMaintenanceCadenceConfig } from "@/lib/preventive-maintenance";
import {
  asBoolean,
  asOptionalString,
  asPositiveInteger,
  jsonValueOrDefault,
  parsePreventiveMaintenanceCadenceType,
  parsePreventiveMaintenanceEventType,
  parsePreventiveMaintenancePlanStatus,
  preventiveMaintenancePlanSelect,
  serializePreventiveMaintenancePlan,
} from "@/lib/preventive-maintenance-api";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../_utils";

export const runtime = "nodejs";

type PreventiveMaintenancePlanPayload = {
  productModelId?: unknown;
  name?: unknown;
  eventType?: unknown;
  status?: unknown;
  cadenceType?: unknown;
  cadenceConfig?: unknown;
  dueSoonThresholdDays?: unknown;
  customerAcknowledgementRequired?: unknown;
  checklistTemplate?: unknown;
  calibrationTemplate?: unknown;
  metadata?: unknown;
};

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const url = new URL(request.url);
    const productModelId = asOptionalString(
      url.searchParams.get("productModelId"),
    );
    const status = parsePreventiveMaintenancePlanStatus(
      url.searchParams.get("status"),
    );

    const plans = await db.preventiveMaintenancePlan.findMany({
      where: {
        organizationId,
        ...(productModelId ? { productModelId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [
        {
          productModel: {
            name: "asc",
          },
        },
        {
          createdAt: "desc",
        },
      ],
      select: preventiveMaintenancePlanSelect,
    });

    return NextResponse.json({
      plans: plans.map(serializePreventiveMaintenancePlan),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId, dbUserId } = await requireManufacturerContext();
    const body = parseJsonBody<PreventiveMaintenancePlanPayload>(
      await request.json(),
    );

    if (!dbUserId) {
      throw new ApiError(
        "Manufacturer user is not linked to a local user record.",
        400,
      );
    }

    const productModelId = asOptionalString(body.productModelId);
    const name = asOptionalString(body.name);
    const eventType = parsePreventiveMaintenanceEventType(body.eventType);
    const cadenceType = parsePreventiveMaintenanceCadenceType(body.cadenceType);
    const status =
      parsePreventiveMaintenancePlanStatus(body.status) ?? "active";
    const dueSoonThresholdDays =
      asPositiveInteger(body.dueSoonThresholdDays) ?? 14;
    const customerAcknowledgementRequired =
      asBoolean(body.customerAcknowledgementRequired) ?? false;

    if (!productModelId) {
      throw new ApiError("productModelId is required.", 400);
    }

    if (!name) {
      throw new ApiError("Preventive maintenance plan name is required.", 400);
    }

    if (!eventType) {
      throw new ApiError(
        "eventType must be preventive_maintenance or calibration.",
        400,
      );
    }

    if (!cadenceType) {
      throw new ApiError(
        "cadenceType must be interval_days, month_offsets, or manual.",
        400,
      );
    }

    try {
      normalizePreventiveMaintenanceCadenceConfig(
        cadenceType,
        body.cadenceConfig,
      );
    } catch (error) {
      throw new ApiError(
        error instanceof Error
          ? error.message
          : "Preventive maintenance cadence config is invalid.",
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
      },
    });

    if (!productModel) {
      throw new ApiError("Product model not found for this manufacturer.", 404);
    }

    const plan = await db.preventiveMaintenancePlan.create({
      data: {
        organizationId,
        productModelId,
        name,
        eventType,
        status,
        cadenceType,
        cadenceConfig: jsonValueOrDefault(body.cadenceConfig, {}),
        dueSoonThresholdDays,
        customerAcknowledgementRequired,
        checklistTemplate: jsonValueOrDefault(body.checklistTemplate, []),
        calibrationTemplate: jsonValueOrDefault(body.calibrationTemplate, []),
        metadata: jsonValueOrDefault(body.metadata, {}),
        createdByUserId: dbUserId,
      },
      select: preventiveMaintenancePlanSelect,
    });

    return NextResponse.json(
      {
        plan: serializePreventiveMaintenancePlan(plan),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

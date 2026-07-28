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
} from "../../../_utils";

export const runtime = "nodejs";

type PreventiveMaintenancePlanUpdatePayload = {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const { id } = await params;
    const body = parseJsonBody<PreventiveMaintenancePlanUpdatePayload>(
      await request.json(),
    );

    if (!id) {
      throw new ApiError("Preventive maintenance plan id is required.", 400);
    }

    const existingPlan = await db.preventiveMaintenancePlan.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        productModelId: true,
        name: true,
        eventType: true,
        status: true,
        cadenceType: true,
        cadenceConfig: true,
        dueSoonThresholdDays: true,
        customerAcknowledgementRequired: true,
        checklistTemplate: true,
        calibrationTemplate: true,
        metadata: true,
      },
    });

    if (!existingPlan) {
      throw new ApiError("Preventive maintenance plan not found.", 404);
    }

    const productModelId =
      asOptionalString(body.productModelId) ?? existingPlan.productModelId;
    const name = asOptionalString(body.name) ?? existingPlan.name;
    const eventType =
      body.eventType === undefined
        ? existingPlan.eventType
        : parsePreventiveMaintenanceEventType(body.eventType);
    const status =
      body.status === undefined
        ? existingPlan.status
        : parsePreventiveMaintenancePlanStatus(body.status);
    const cadenceType =
      body.cadenceType === undefined
        ? existingPlan.cadenceType
        : parsePreventiveMaintenanceCadenceType(body.cadenceType);
    const dueSoonThresholdDays =
      body.dueSoonThresholdDays === undefined
        ? existingPlan.dueSoonThresholdDays
        : asPositiveInteger(body.dueSoonThresholdDays);
    const customerAcknowledgementRequired =
      body.customerAcknowledgementRequired === undefined
        ? existingPlan.customerAcknowledgementRequired
        : asBoolean(body.customerAcknowledgementRequired);

    if (!name) {
      throw new ApiError("Preventive maintenance plan name is required.", 400);
    }

    if (!eventType) {
      throw new ApiError(
        "eventType must be preventive_maintenance or calibration.",
        400,
      );
    }

    if (!status) {
      throw new ApiError("status must be active or inactive.", 400);
    }

    if (!cadenceType) {
      throw new ApiError(
        "cadenceType must be interval_days, month_offsets, or manual.",
        400,
      );
    }

    if (!dueSoonThresholdDays) {
      throw new ApiError(
        "dueSoonThresholdDays must be a positive integer.",
        400,
      );
    }

    if (customerAcknowledgementRequired === null) {
      throw new ApiError(
        "customerAcknowledgementRequired must be a boolean.",
        400,
      );
    }

    const cadenceConfig =
      body.cadenceConfig === undefined
        ? jsonValueOrDefault(existingPlan.cadenceConfig, {})
        : jsonValueOrDefault(body.cadenceConfig, {});

    try {
      normalizePreventiveMaintenanceCadenceConfig(cadenceType, cadenceConfig);
    } catch (error) {
      throw new ApiError(
        error instanceof Error
          ? error.message
          : "Preventive maintenance cadence config is invalid.",
        400,
      );
    }

    if (productModelId !== existingPlan.productModelId) {
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
        throw new ApiError(
          "Product model not found for this manufacturer.",
          404,
        );
      }
    }

    const updated = await db.preventiveMaintenancePlan.update({
      where: {
        id: existingPlan.id,
      },
      data: {
        productModelId,
        name,
        eventType,
        status,
        cadenceType,
        cadenceConfig,
        dueSoonThresholdDays,
        customerAcknowledgementRequired,
        checklistTemplate:
          body.checklistTemplate === undefined
            ? jsonValueOrDefault(existingPlan.checklistTemplate, [])
            : jsonValueOrDefault(body.checklistTemplate, []),
        calibrationTemplate:
          body.calibrationTemplate === undefined
            ? jsonValueOrDefault(existingPlan.calibrationTemplate, [])
            : jsonValueOrDefault(body.calibrationTemplate, []),
        metadata:
          body.metadata === undefined
            ? jsonValueOrDefault(existingPlan.metadata, {})
            : jsonValueOrDefault(body.metadata, {}),
      },
      select: preventiveMaintenancePlanSelect,
    });

    return NextResponse.json({
      plan: serializePreventiveMaintenancePlan(updated),
    });
  } catch (error) {
    return jsonError(error);
  }
}

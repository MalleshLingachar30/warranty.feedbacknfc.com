import { NextResponse, type NextRequest } from "next/server";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "@/app/api/service-center/_utils";
import {
  InternalServiceOrderActionError,
  type UpdateInternalServiceOrderRequest,
  normalizeInternalServiceOrderUpdateInput,
  updateInternalServiceOrderForDepot,
} from "@/lib/internal-service-order-actions";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId, dbUserId } = await requireServiceCenterContext();
    const { id } = await context.params;
    const body = parseJsonBody<UpdateInternalServiceOrderRequest>(await request.json());

    if (!dbUserId) {
      throw new ApiError("Service-center user is not linked to a local user record.", 400);
    }

    if (!id) {
      throw new ApiError("Internal-service order id is required.", 400);
    }

    const order = await updateInternalServiceOrderForDepot({
      organizationId,
      dbUserId,
      orderId: id,
      update: normalizeInternalServiceOrderUpdateInput(body),
    });

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error) {
    if (error instanceof InternalServiceOrderActionError) {
      return jsonError(new ApiError(error.message, error.statusCode));
    }

    return jsonError(error);
  }
}

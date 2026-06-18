import { NextResponse } from "next/server";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../_utils";
import {
  createInternalServiceOrder,
  type InternalServiceCreatePayload,
  normalizeInternalServiceCreateInput,
} from "../../internal-services/_shared";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { organizationId, dbUserId } = await requireManufacturerContext();

    if (!dbUserId) {
      throw new ApiError("Manufacturer user is not linked to a local user record.", 400);
    }

    const body = parseJsonBody<InternalServiceCreatePayload>(await request.json());
    const normalized = normalizeInternalServiceCreateInput(body);

    const serviceCenter = await db.serviceCenter.findFirst({
      where: {
        id: normalized.serviceCenterId,
        OR: [
          {
            manufacturerAuthorizations: {
              has: organizationId,
            },
          },
          {
            organizationId,
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!serviceCenter) {
      throw new ApiError("Selected depot / service center is not available to this manufacturer.", 404);
    }

    const order = await createInternalServiceOrder({
      manufacturerOrgId: organizationId,
      serviceCenterId: serviceCenter.id,
      requestedByUserId: dbUserId,
      receivedByUserId: dbUserId,
      normalized,
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(new ApiError(error.message, 400));
    }

    return jsonError(error);
  }
}

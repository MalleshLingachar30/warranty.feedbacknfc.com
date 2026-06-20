import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveInternalServiceBenchScanContext } from "@/lib/internal-service-bench";

import {
  ApiError,
  jsonError,
  requireInternalServiceContext,
} from "../../../_utils";

export async function GET(request: Request) {
  try {
    const { organizationId } = await requireInternalServiceContext();
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim() ?? "";

    if (!code) {
      throw new ApiError("A controlling tag, asset code, or serial is required.", 400);
    }

    const authorizedManufacturerIds = Array.from(
      new Set(
        (
          await db.serviceCenter.findMany({
            where: {
              organizationId,
            },
            select: {
              manufacturerAuthorizations: true,
            },
          })
        ).flatMap((serviceCenter) => serviceCenter.manufacturerAuthorizations),
      ),
    );

    if (authorizedManufacturerIds.length === 0) {
      throw new ApiError(
        "This service-center organization has no manufacturer authorizations for bench scan resolution.",
        403,
      );
    }

    const bench = await db.$transaction((tx) =>
      resolveInternalServiceBenchScanContext(tx, code, {
        manufacturerOrgIds: authorizedManufacturerIds,
      }),
    );

    return NextResponse.json({ bench });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) {
      return jsonError(new ApiError(error.message, 400));
    }

    return jsonError(error);
  }
}

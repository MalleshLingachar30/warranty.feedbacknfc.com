import { NextResponse } from "next/server";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../_utils";

type TeamMemberPatchPayload = {
  isActive?: unknown;
};

function asOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const { id } = await context.params;

    if (!id) {
      throw new ApiError("Team member id is required.", 400);
    }

    const body = parseJsonBody<TeamMemberPatchPayload>(await request.json());
    const isActive = asOptionalBoolean(body.isActive);

    if (isActive === null) {
      throw new ApiError("isActive must be a boolean.", 400);
    }

    const existing = await db.user.findFirst({
      where: {
        id,
        organizationId,
        role: "manufacturer_admin",
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new ApiError("Team member not found.", 404);
    }

    const member = await db.user.update({
      where: {
        id,
      },
      data: {
        isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        clerkId: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      member: {
        id: member.id,
        name: member.name ?? "",
        email: member.email ?? "",
        clerkId: member.clerkId,
        isActive: member.isActive,
        createdAt: member.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

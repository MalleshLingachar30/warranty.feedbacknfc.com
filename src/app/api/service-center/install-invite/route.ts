import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { sendInstallInviteIfNeeded } from "@/lib/install-app-invite";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "../_utils";

type InstallInvitePayload = {
  target?: unknown;
  technicianId?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireServiceCenterContext();
    const authData = await auth();
    const body = parseJsonBody<InstallInvitePayload>(await request.json());
    const target = asString(body.target);

    if (target !== "technician" && target !== "service_center_admin") {
      throw new ApiError("Valid invite target is required.", 400);
    }

    if (target === "service_center_admin") {
      if (!authData.userId) {
        throw new ApiError("Unauthorized", 401);
      }

      const user = await db.user.findFirst({
        where: {
          clerkId: authData.userId,
          organizationId,
          role: "service_center_admin",
        },
        select: {
          id: true,
          email: true,
          phone: true,
        },
      });

      if (!user) {
        throw new ApiError(
          "Current service-center admin could not be resolved.",
          404,
        );
      }

      const result = await sendInstallInviteIfNeeded({
        userId: user.id,
        role: "service_center_admin",
        fallbackEmail: user.email,
        fallbackPhone: user.phone,
        force: true,
      });

      if (!result.sent) {
        throw new ApiError(
          "No phone or email is available for this admin account.",
          400,
        );
      }

      return NextResponse.json({
        success: true,
        message: `Install invite sent via ${result.channels.join(" and ")}.`,
      });
    }

    const technicianId = asString(body.technicianId);

    if (!technicianId) {
      throw new ApiError("technicianId is required.", 400);
    }

    const technician = await db.technician.findFirst({
      where: {
        id: technicianId,
        serviceCenter: {
          organizationId,
        },
      },
      select: {
        id: true,
        userId: true,
        phone: true,
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!technician) {
      throw new ApiError("Technician not found for this organization.", 404);
    }

    const result = await sendInstallInviteIfNeeded({
      userId: technician.userId,
      role: "technician",
      fallbackEmail: technician.user.email,
      fallbackPhone: technician.phone ?? technician.user.phone,
      force: true,
    });

    if (!result.sent) {
      throw new ApiError(
        "No phone or email is available for this technician.",
        400,
      );
    }

    return NextResponse.json({
      success: true,
      message: `Install invite sent via ${result.channels.join(" and ")}.`,
    });
  } catch (error) {
    return jsonError(error);
  }
}

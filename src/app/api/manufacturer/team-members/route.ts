import { NextResponse } from "next/server";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../_utils";

type TeamMemberCreatePayload = {
  clerkId?: unknown;
  name?: unknown;
  email?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toMemberResponse(member: {
  id: string;
  name: string | null;
  email: string | null;
  clerkId: string;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: member.id,
    name: member.name ?? "",
    email: member.email ?? "",
    clerkId: member.clerkId,
    isActive: member.isActive,
    createdAt: member.createdAt.toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<TeamMemberCreatePayload>(await request.json());
    const clerkId = asString(body.clerkId);

    if (!clerkId) {
      throw new ApiError("Clerk user ID is required.", 400);
    }

    const name = asString(body.name);
    const email = asString(body.email);

    const existing = await db.user.findUnique({
      where: {
        clerkId,
      },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (existing?.organizationId && existing.organizationId !== organizationId) {
      throw new ApiError(
        "This Clerk user is already linked to another organization.",
        409,
      );
    }

    const member = await db.user.upsert({
      where: {
        clerkId,
      },
      update: {
        organizationId,
        role: "manufacturer_admin",
        isActive: true,
        name: name ?? undefined,
        email: email ?? undefined,
      },
      create: {
        clerkId,
        organizationId,
        role: "manufacturer_admin",
        isActive: true,
        name: name ?? null,
        email: email ?? null,
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
      member: toMemberResponse(member),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();

    const members = await db.user.findMany({
      where: {
        organizationId,
        role: "manufacturer_admin",
      },
      orderBy: {
        createdAt: "asc",
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
      members: members.map((member) => toMemberResponse(member)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

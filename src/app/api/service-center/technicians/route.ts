import { NextResponse } from "next/server";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "../_utils";

export const runtime = "nodejs";

type CreateTechnicianPayload = {
  clerkId?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  skills?: unknown;
  maxConcurrentJobs?: unknown;
  serviceCenterId?: unknown;
  isAvailable?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function asOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  if (normalized <= 0) {
    return null;
  }

  return normalized;
}

function parseSkills(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  const asText = asString(value);
  if (!asText) {
    return [];
  }

  return Array.from(
    new Set(
      asText
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

async function resolveServiceCenterId(input: {
  organizationId: string;
  requestedServiceCenterId: string | null;
}) {
  if (input.requestedServiceCenterId) {
    const serviceCenter = await db.serviceCenter.findFirst({
      where: {
        id: input.requestedServiceCenterId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!serviceCenter) {
      throw new ApiError("Service center not found for this organization.", 404);
    }

    return serviceCenter;
  }

  const fallback = await db.serviceCenter.findFirst({
    where: {
      organizationId: input.organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!fallback) {
    throw new ApiError(
      "No service center exists for this organization. Add a service center in Settings first.",
      409,
    );
  }

  return fallback;
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireServiceCenterContext();
    const body = parseJsonBody<CreateTechnicianPayload>(await request.json());

    const clerkId = asString(body.clerkId);
    const requestedServiceCenterId = asString(body.serviceCenterId);

    if (!clerkId) {
      throw new ApiError("clerkId is required.", 400);
    }

    const existingUser = await db.user.findUnique({
      where: {
        clerkId,
      },
      select: {
        id: true,
        role: true,
        organizationId: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    if (
      existingUser &&
      existingUser.role !== "technician" &&
      existingUser.role !== "customer"
    ) {
      throw new ApiError(
        `This Clerk user is already registered as ${existingUser.role}. Ask a super admin to change roles.`,
        409,
      );
    }

    if (
      existingUser?.organizationId &&
      existingUser.organizationId !== organizationId
    ) {
      throw new ApiError(
        "This Clerk user already belongs to a different organization.",
        409,
      );
    }

    const nameInput = asString(body.name);
    const phoneInput = asString(body.phone);
    const emailInput = asString(body.email);
    const skills = parseSkills(body.skills);
    const maxConcurrentJobs = asPositiveInteger(body.maxConcurrentJobs);
    const isAvailable = asOptionalBoolean(body.isAvailable);

    const serviceCenter = await resolveServiceCenterId({
      organizationId,
      requestedServiceCenterId,
    });

    const user = await db.user.upsert({
      where: {
        clerkId,
      },
      create: {
        clerkId,
        role: "technician",
        organizationId,
        name: nameInput,
        phone: phoneInput ? normalizePhone(phoneInput) : null,
        email: emailInput,
      },
      update: {
        role: "technician",
        organizationId,
        name: nameInput ?? undefined,
        phone: phoneInput ? normalizePhone(phoneInput) : undefined,
        email: emailInput ?? undefined,
      },
      select: {
        id: true,
        clerkId: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        organizationId: true,
      },
    });

    const resolvedName = nameInput ?? user.name ?? existingUser?.name ?? null;
    const resolvedPhone = phoneInput
      ? normalizePhone(phoneInput)
      : user.phone ?? existingUser?.phone ?? null;

    if (!resolvedName) {
      throw new ApiError("Technician name is required.", 400);
    }

    if (!resolvedPhone) {
      throw new ApiError("Technician phone is required.", 400);
    }

    const technician = await db.technician.upsert({
      where: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        serviceCenterId: serviceCenter.id,
        name: resolvedName,
        phone: resolvedPhone,
        skills,
        ...(maxConcurrentJobs ? { maxConcurrentJobs } : null),
        ...(typeof isAvailable === "boolean" ? { isAvailable } : null),
      },
      update: {
        serviceCenterId: serviceCenter.id,
        name: resolvedName,
        phone: resolvedPhone,
        skills,
        ...(maxConcurrentJobs ? { maxConcurrentJobs } : null),
        ...(typeof isAvailable === "boolean" ? { isAvailable } : null),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        skills: true,
        isAvailable: true,
        activeJobCount: true,
        maxConcurrentJobs: true,
        serviceCenter: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            clerkId: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      technician,
    });
  } catch (error) {
    return jsonError(error);
  }
}

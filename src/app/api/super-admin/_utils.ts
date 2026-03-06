import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { clerkOrDbHasRole } from "@/lib/rbac";

const REQUIRED_ROLE = "super_admin";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

export async function requireSuperAdminContext() {
  const authData = await auth();

  if (!authData.userId) {
    throw new ApiError("Unauthorized", 401);
  }

  const roleGuardDisabled =
    process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true";

  if (!roleGuardDisabled) {
    const hasRequiredRole = await clerkOrDbHasRole({
      clerkUserId: authData.userId,
      orgRole: authData.orgRole,
      sessionClaims: authData.sessionClaims,
      requiredRole: REQUIRED_ROLE,
      allowSuperAdmin: true,
    });

    if (!hasRequiredRole) {
      throw new ApiError("Forbidden", 403);
    }
  }

  return {
    clerkUserId: authData.userId,
  };
}

export function parseJsonBody<T extends object>(value: unknown) {
  if (!isRecord(value)) {
    throw new ApiError("Invalid JSON body.", 400);
  }

  return value as T;
}

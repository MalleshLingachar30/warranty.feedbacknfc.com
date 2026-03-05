import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { resolveOrganizationContext, sessionHasRole } from "@/lib/org-context";

const REQUIRED_ROLE = "service_center_admin";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object";
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

export type ServiceCenterContext = {
  organizationId: string;
  dbUserId: string | null;
  clerkUserId: string;
};

export async function requireServiceCenterContext(): Promise<ServiceCenterContext> {
  const authData = await auth();

  if (!authData.userId) {
    throw new ApiError("Unauthorized", 401);
  }

  const roleGuardDisabled =
    process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true";

  if (!roleGuardDisabled) {
    const hasRequiredRole = sessionHasRole({
      orgRole: authData.orgRole,
      sessionClaims: authData.sessionClaims,
      requiredRole: REQUIRED_ROLE,
    });

    if (!hasRequiredRole) {
      throw new ApiError("Forbidden", 403);
    }
  }

  const { organizationId, dbUserId } = await resolveOrganizationContext({
    clerkUserId: authData.userId,
    clerkOrgId: authData.orgId ?? null,
    requiredOrganizationType: "service_center",
  });

  if (!organizationId) {
    throw new ApiError(
      "No service-center organization is associated with this user.",
      400,
    );
  }

  return {
    organizationId,
    dbUserId,
    clerkUserId: authData.userId,
  };
}

export function parseJsonBody<T extends object>(value: unknown) {
  if (!isRecord(value)) {
    throw new ApiError("Invalid JSON body.", 400);
  }

  return value as T;
}

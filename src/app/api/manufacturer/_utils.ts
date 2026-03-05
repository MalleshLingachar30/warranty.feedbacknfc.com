import { auth } from "@clerk/nextjs/server";
import { type ClaimStatus, type TicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { resolveOrganizationContext, sessionHasRole } from "@/lib/org-context";

const REQUIRED_ROLE = "manufacturer_admin";

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

export type ManufacturerContext = {
  organizationId: string;
  dbUserId: string | null;
  clerkUserId: string;
};

export async function requireManufacturerContext(): Promise<ManufacturerContext> {
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
    requiredOrganizationType: "manufacturer",
  });

  if (!organizationId) {
    throw new ApiError(
      "No manufacturer organization is associated with this user.",
      400,
    );
  }

  return {
    organizationId,
    dbUserId,
    clerkUserId: authData.userId,
  };
}

export function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalized = entry.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

export const PENDING_REVIEW_CLAIM_STATUSES: ClaimStatus[] = [
  "auto_generated",
  "submitted",
  "under_review",
];

export function parseJsonBody<T extends object>(value: unknown) {
  if (!isRecord(value)) {
    throw new ApiError("Invalid JSON body.", 400);
  }

  return value as T;
}

export function formatAllocationId(allocationId: string, allocatedAt: Date) {
  const y = allocatedAt.getFullYear().toString();
  const m = String(allocatedAt.getMonth() + 1).padStart(2, "0");
  const d = String(allocatedAt.getDate()).padStart(2, "0");

  return `ALLOC-${y}${m}${d}-${allocationId.slice(0, 8).toUpperCase()}`;
}

export function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

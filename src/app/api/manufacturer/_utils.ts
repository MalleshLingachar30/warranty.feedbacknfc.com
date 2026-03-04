import { auth } from "@clerk/nextjs/server";
import { type ClaimStatus, type TicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";

type GenericRecord = Record<string, unknown>;

const REQUIRED_ROLE = "manufacturer_admin";

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object";
}

function normalizeRole(role: string) {
  return role.replace(/^org:/, "").toLowerCase();
}

function pushRole(roles: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    roles.add(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim().length > 0) {
        roles.add(item);
      }
    }
  }
}

function extractRolesFromClaims(claims: unknown) {
  const roles = new Set<string>();

  if (!isRecord(claims)) {
    return roles;
  }

  pushRole(roles, claims.role);
  pushRole(roles, claims.roles);

  const metadata = claims.metadata;
  if (isRecord(metadata)) {
    pushRole(roles, metadata.role);
    pushRole(roles, metadata.roles);
  }

  const publicMetadata = claims.public_metadata;
  if (isRecord(publicMetadata)) {
    pushRole(roles, publicMetadata.role);
    pushRole(roles, publicMetadata.roles);
  }

  return roles;
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
    const allRoles = new Set<string>();
    pushRole(allRoles, authData.orgRole);

    const claimRoles = extractRolesFromClaims(authData.sessionClaims);
    for (const role of claimRoles) {
      allRoles.add(role);
    }

    const hasRequiredRole = [...allRoles].some(
      (role) => normalizeRole(role) === REQUIRED_ROLE,
    );

    if (!hasRequiredRole) {
      throw new ApiError("Forbidden", 403);
    }
  }

  const userRecord = await db.user.findUnique({
    where: { clerkId: authData.userId },
    select: {
      id: true,
      organizationId: true,
    },
  });

  let organizationId = authData.orgId ?? userRecord?.organizationId ?? null;

  if (!organizationId && process.env.NODE_ENV !== "production") {
    const fallbackOrg = await db.organization.findFirst({
      where: { type: "manufacturer" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    organizationId = fallbackOrg?.id ?? null;
  }

  if (!organizationId) {
    throw new ApiError(
      "No manufacturer organization is associated with this user.",
      400,
    );
  }

  return {
    organizationId,
    dbUserId: userRecord?.id ?? null,
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

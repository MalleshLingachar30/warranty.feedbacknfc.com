import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";

type GenericRecord = Record<string, unknown>;

export type ServiceCenterPageContext = {
  organizationId: string | null;
  clerkUserId: string;
  dbUserId: string | null;
};

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

export async function resolveServiceCenterPageContext(): Promise<ServiceCenterPageContext> {
  const authData = await auth();

  if (!authData.userId) {
    authData.redirectToSignIn();
  }

  if (process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD !== "true") {
    const allRoles = new Set<string>();
    pushRole(allRoles, authData.orgRole);

    const claimRoles = extractRolesFromClaims(authData.sessionClaims);
    for (const role of claimRoles) {
      allRoles.add(role);
    }

    const hasRequiredRole = [...allRoles].some(
      (role) => normalizeRole(role) === "service_center_admin",
    );

    if (!hasRequiredRole) {
      redirect("/dashboard?access=denied&required=service_center_admin");
    }
  }

  const clerkUserId = authData.userId;

  if (!clerkUserId) {
    throw new Error("Authenticated clerk user id is required.");
  }

  const userRecord = await db.user.findUnique({
    where: {
      clerkId: clerkUserId,
    },
    select: {
      id: true,
      organizationId: true,
    },
  });

  let organizationId = authData.orgId ?? userRecord?.organizationId ?? null;

  if (!organizationId && process.env.NODE_ENV !== "production") {
    const fallbackOrg = await db.organization.findFirst({
      where: {
        type: "service_center",
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    organizationId = fallbackOrg?.id ?? null;
  }

  return {
    organizationId,
    clerkUserId,
    dbUserId: userRecord?.id ?? null,
  };
}

export function decimalToNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      const numeric = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(numeric) ? numeric : 0;
    } catch {
      return 0;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

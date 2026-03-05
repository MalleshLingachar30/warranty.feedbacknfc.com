import { type OrganizationType } from "@prisma/client";

import { db } from "@/lib/db";

type GenericRecord = Record<string, unknown>;

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

export function sessionHasRole(input: {
  orgRole: string | null | undefined;
  sessionClaims: unknown;
  requiredRole: string;
}) {
  const allRoles = new Set<string>();
  pushRole(allRoles, input.orgRole);

  const claimRoles = extractRolesFromClaims(input.sessionClaims);
  for (const role of claimRoles) {
    allRoles.add(role);
  }

  return [...allRoles].some(
    (role) => normalizeRole(role) === input.requiredRole,
  );
}

export type OrganizationContext = {
  organizationId: string | null;
  dbUserId: string | null;
};

export async function resolveOrganizationContext(input: {
  clerkUserId: string;
  clerkOrgId: string | null;
  requiredOrganizationType: OrganizationType;
}): Promise<OrganizationContext> {
  const userRecord = await db.user.findUnique({
    where: {
      clerkId: input.clerkUserId,
    },
    select: {
      id: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          type: true,
        },
      },
    },
  });

  const candidateOrgIds = [
    input.clerkOrgId,
    userRecord?.organizationId ?? null,
  ].filter((value): value is string => Boolean(value));

  const uniqueCandidateOrgIds = Array.from(new Set(candidateOrgIds));

  if (
    userRecord?.organization &&
    userRecord.organization.type === input.requiredOrganizationType
  ) {
    return {
      organizationId: userRecord.organization.id,
      dbUserId: userRecord.id,
    };
  }

  if (uniqueCandidateOrgIds.length > 0) {
    const organizations = await db.organization.findMany({
      where: {
        id: {
          in: uniqueCandidateOrgIds,
        },
      },
      select: {
        id: true,
        type: true,
      },
    });

    const byId = new Map(organizations.map((org) => [org.id, org]));

    for (const candidateOrgId of uniqueCandidateOrgIds) {
      const organization = byId.get(candidateOrgId);
      if (!organization) {
        continue;
      }

      if (organization.type === input.requiredOrganizationType) {
        return {
          organizationId: organization.id,
          dbUserId: userRecord?.id ?? null,
        };
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const fallbackOrg = await db.organization.findFirst({
      where: {
        type: input.requiredOrganizationType,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    if (fallbackOrg) {
      return {
        organizationId: fallbackOrg.id,
        dbUserId: userRecord?.id ?? null,
      };
    }
  }

  return {
    organizationId: null,
    dbUserId: userRecord?.id ?? null,
  };
}

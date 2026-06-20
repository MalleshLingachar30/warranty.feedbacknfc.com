import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";
import { sessionHasRole } from "@/lib/org-context";

const fetchDbUserRole = cache(async (clerkUserId: string) => {
  return withDatabaseRetry(() =>
    db.user.findUnique({
      where: {
        clerkId: clerkUserId,
      },
      select: {
        role: true,
      },
    }),
  );
});

export async function clerkOrDbHasRole(input: {
  clerkUserId: string;
  orgRole: string | null | undefined;
  sessionClaims: unknown;
  requiredRole: string;
  allowPlatformOwner?: boolean;
}): Promise<boolean> {
  return clerkOrDbHasAnyRole({
    clerkUserId: input.clerkUserId,
    orgRole: input.orgRole,
    sessionClaims: input.sessionClaims,
    requiredRoles: [input.requiredRole],
    allowPlatformOwner: input.allowPlatformOwner,
  });
}

export async function clerkOrDbHasAnyRole(input: {
  clerkUserId: string;
  orgRole: string | null | undefined;
  sessionClaims: unknown;
  requiredRoles: string[];
  allowPlatformOwner?: boolean;
}): Promise<boolean> {
  const allowPlatformOwner = input.allowPlatformOwner ?? true;
  for (const requiredRole of input.requiredRoles) {
    const hasClerkRole = sessionHasRole({
      orgRole: input.orgRole,
      sessionClaims: input.sessionClaims,
      requiredRole,
    });

    if (hasClerkRole) {
      return true;
    }
  }

  const dbUser = await fetchDbUserRole(input.clerkUserId);

  if (!dbUser) {
    return false;
  }

  if (allowPlatformOwner && dbUser.role === "platform_owner") {
    return true;
  }

  return input.requiredRoles.includes(dbUser.role);
}

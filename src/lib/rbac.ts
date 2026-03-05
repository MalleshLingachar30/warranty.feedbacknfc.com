import "server-only";

import { db } from "@/lib/db";
import { sessionHasRole } from "@/lib/org-context";

export async function clerkOrDbHasRole(input: {
  clerkUserId: string;
  orgRole: string | null | undefined;
  sessionClaims: unknown;
  requiredRole: string;
  allowSuperAdmin?: boolean;
}): Promise<boolean> {
  const allowSuperAdmin = input.allowSuperAdmin ?? true;

  const hasClerkRole = sessionHasRole({
    orgRole: input.orgRole,
    sessionClaims: input.sessionClaims,
    requiredRole: input.requiredRole,
  });

  if (hasClerkRole) {
    return true;
  }

  const dbUser = await db.user.findUnique({
    where: {
      clerkId: input.clerkUserId,
    },
    select: {
      role: true,
    },
  });

  if (!dbUser) {
    return false;
  }

  if (allowSuperAdmin && dbUser.role === "super_admin") {
    return true;
  }

  return dbUser.role === input.requiredRole;
}


import { cache } from "react";
import { redirect } from "next/navigation";

import { getCachedAuth } from "@/lib/clerk-session";
import {
  MANUFACTURER_WORKSPACE_ROLES,
  type AppRole,
} from "@/lib/roles";
import { clerkOrDbHasAnyRole } from "@/lib/rbac";

type EnsureManufacturerAccessOptions = {
  allowedRoles?: AppRole[];
  requiredLabel?: string;
};

export const ensureManufacturerAccess = cache(
  async (options: EnsureManufacturerAccessOptions = {}) => {
  const authData = await getCachedAuth();

  if (!authData.userId) {
    authData.redirectToSignIn();
  }

  // Optional escape hatch for local UI work before auth claims are wired.
  if (process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true") {
    return authData;
  }

    const hasRequiredRole = authData.userId
      ? await clerkOrDbHasAnyRole({
        clerkUserId: authData.userId,
        orgRole: authData.orgRole,
        sessionClaims: authData.sessionClaims,
        requiredRoles: options.allowedRoles ?? ["manufacturer_admin"],
      })
      : false;

    if (!hasRequiredRole) {
      redirect(
        `/dashboard?access=denied&required=${options.requiredLabel ?? "manufacturer_admin"}`,
      );
    }

    return authData;
  },
);

export const ensureManufacturerAdmin = cache(async () =>
  ensureManufacturerAccess({
    allowedRoles: ["manufacturer_admin"],
    requiredLabel: "manufacturer_admin",
  }),
);

export const ensureManufacturerWorkspaceAccess = cache(async () =>
  ensureManufacturerAccess({
    allowedRoles: MANUFACTURER_WORKSPACE_ROLES,
    requiredLabel: "manufacturer_workspace",
  }),
);

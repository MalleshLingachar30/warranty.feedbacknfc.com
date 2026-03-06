import { cache } from "react";
import { redirect } from "next/navigation";

import { getCachedAuth } from "@/lib/clerk-session";
import { clerkOrDbHasRole } from "@/lib/rbac";

const REQUIRED_ROLE = "manufacturer_admin";

export const ensureManufacturerAdmin = cache(async () => {
  const authData = await getCachedAuth();

  if (!authData.userId) {
    authData.redirectToSignIn();
  }

  // Optional escape hatch for local UI work before auth claims are wired.
  if (process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true") {
    return authData;
  }

  const hasRequiredRole = authData.userId
    ? await clerkOrDbHasRole({
        clerkUserId: authData.userId,
        orgRole: authData.orgRole,
        sessionClaims: authData.sessionClaims,
        requiredRole: REQUIRED_ROLE,
      })
    : false;

  if (!hasRequiredRole) {
    redirect("/dashboard?access=denied&required=manufacturer_admin");
  }

  return authData;
});

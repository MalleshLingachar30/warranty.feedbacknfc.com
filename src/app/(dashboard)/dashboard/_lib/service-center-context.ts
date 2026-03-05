import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  resolveOrganizationContext,
  sessionHasRole,
} from "@/lib/org-context";

export type ServiceCenterPageContext = {
  organizationId: string | null;
  clerkUserId: string;
  dbUserId: string | null;
};

export async function resolveServiceCenterPageContext(): Promise<ServiceCenterPageContext> {
  const authData = await auth();

  if (!authData.userId) {
    authData.redirectToSignIn();
  }

  if (process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD !== "true") {
    const hasRequiredRole = sessionHasRole({
      orgRole: authData.orgRole,
      sessionClaims: authData.sessionClaims,
      requiredRole: "service_center_admin",
    });

    if (!hasRequiredRole) {
      redirect("/dashboard?access=denied&required=service_center_admin");
    }
  }

  const clerkUserId = authData.userId;

  if (!clerkUserId) {
    throw new Error("Authenticated clerk user id is required.");
  }

  const { organizationId, dbUserId } = await resolveOrganizationContext({
    clerkUserId,
    clerkOrgId: authData.orgId ?? null,
    requiredOrganizationType: "service_center",
  });

  return {
    organizationId,
    clerkUserId,
    dbUserId,
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

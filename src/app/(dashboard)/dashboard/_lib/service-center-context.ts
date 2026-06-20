import { redirect } from "next/navigation";
import { cache } from "react";

import { getCachedAuth } from "@/lib/clerk-session";
import { resolveOrganizationContext } from "@/lib/org-context";
import {
  INTERNAL_SERVICE_ROLES,
  SERVICE_CENTER_FIELD_ROLES,
  type AppRole,
} from "@/lib/roles";
import { clerkOrDbHasAnyRole } from "@/lib/rbac";

export type ServiceCenterPageContext = {
  organizationId: string | null;
  clerkUserId: string;
  dbUserId: string | null;
};

async function resolveScopedServiceCenterPageContext(input: {
  allowedRoles: AppRole[];
  requiredLabel: string;
}): Promise<ServiceCenterPageContext> {
    const authData = await getCachedAuth();

    if (!authData.userId) {
      authData.redirectToSignIn();
    }

    if (process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD !== "true") {
      const hasRequiredRole = authData.userId
        ? await clerkOrDbHasAnyRole({
            clerkUserId: authData.userId,
            orgRole: authData.orgRole,
            sessionClaims: authData.sessionClaims,
            requiredRoles: input.allowedRoles,
          })
        : false;

      if (!hasRequiredRole) {
        redirect(`/dashboard?access=denied&required=${input.requiredLabel}`);
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

export const resolveServiceCenterPageContext = cache(
  async (): Promise<ServiceCenterPageContext> =>
    resolveScopedServiceCenterPageContext({
      allowedRoles: [...new Set([...SERVICE_CENTER_FIELD_ROLES, ...INTERNAL_SERVICE_ROLES])],
      requiredLabel: "service_center",
    }),
);

export const resolveFieldServicePageContext = cache(
  async (): Promise<ServiceCenterPageContext> =>
    resolveScopedServiceCenterPageContext({
      allowedRoles: SERVICE_CENTER_FIELD_ROLES,
      requiredLabel: "field_service",
    }),
);

export const resolveInternalServicePageContext = cache(
  async (): Promise<ServiceCenterPageContext> =>
    resolveScopedServiceCenterPageContext({
      allowedRoles: INTERNAL_SERVICE_ROLES,
      requiredLabel: "internal_services",
    }),
);

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

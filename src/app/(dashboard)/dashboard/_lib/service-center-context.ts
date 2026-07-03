import { redirect } from "next/navigation";
import { cache } from "react";

import { getCachedAuth } from "@/lib/clerk-session";
import { resolveOrganizationContext } from "@/lib/org-context";
import { resolveAppRoleForSession } from "@/lib/app-user";
import {
  INTERNAL_SERVICE_ROLES,
  SERVICE_CENTER_FIELD_ROLES,
  type AppRole,
} from "@/lib/roles";

export type ServiceCenterPageContext = {
  organizationId: string | null;
  clerkUserId: string;
  dbUserId: string | null;
  role: AppRole;
};

async function resolveScopedServiceCenterPageContext(input: {
  allowedRoles: AppRole[];
  requiredLabel: string;
}): Promise<ServiceCenterPageContext> {
  const authData = await getCachedAuth();

  if (!authData.userId) {
    authData.redirectToSignIn();
  }

  const clerkUserId = authData.userId;

  if (!clerkUserId) {
    throw new Error("Authenticated clerk user id is required.");
  }

  const { role, dbUser } = await resolveAppRoleForSession({
    clerkUserId,
    sessionClaims: authData.sessionClaims,
  });

  if (
    process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD !== "true" &&
    !input.allowedRoles.includes(role)
  ) {
    redirect(`/dashboard?access=denied&required=${input.requiredLabel}`);
  }

  const { organizationId, dbUserId } =
    dbUser.organizationId && dbUser.organizationType === "service_center"
      ? {
          organizationId: dbUser.organizationId,
          dbUserId: dbUser.id,
        }
      : await resolveOrganizationContext({
          clerkUserId,
          clerkOrgId: authData.orgId ?? null,
          requiredOrganizationType: "service_center",
        });

  return {
    organizationId,
    clerkUserId,
    dbUserId,
    role,
  };
}

export const resolveServiceCenterPageContext = cache(
  async (): Promise<ServiceCenterPageContext> =>
    resolveScopedServiceCenterPageContext({
      allowedRoles: [
        ...new Set([...SERVICE_CENTER_FIELD_ROLES, ...INTERNAL_SERVICE_ROLES]),
      ],
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

export async function resolveRestrictedInternalServicePageContext(input: {
  allowedRoles: AppRole[];
  requiredLabel: string;
}) {
  return resolveScopedServiceCenterPageContext(input);
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

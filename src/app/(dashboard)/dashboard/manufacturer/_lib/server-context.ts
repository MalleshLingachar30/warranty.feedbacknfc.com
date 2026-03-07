import { cache } from "react";

import { ensureManufacturerAdmin } from "@/lib/auth";
import { resolveOrganizationContext } from "@/lib/org-context";

export type ManufacturerPageContext = {
  organizationId: string | null;
  organizationName: string | null;
  clerkUserId: string;
  dbUserId: string | null;
};

export const resolveManufacturerPageContext = cache(
  async (): Promise<ManufacturerPageContext> => {
    const authData = await ensureManufacturerAdmin();
    const clerkUserId = authData.userId;

    if (!clerkUserId) {
      throw new Error("Authenticated clerk user id is required.");
    }

    const { organizationId, dbUserId } = await resolveOrganizationContext({
      clerkUserId,
      clerkOrgId: authData.orgId ?? null,
      requiredOrganizationType: "manufacturer",
    });

    let organizationName: string | null = null;

    if (organizationId) {
      const organization = await import("@/lib/db").then(({ db }) =>
        db.organization.findUnique({
          where: {
            id: organizationId,
          },
          select: {
            name: true,
          },
        }),
      );

      organizationName = organization?.name ?? null;
    }

    return {
      organizationId,
      organizationName,
      clerkUserId,
      dbUserId,
    };
  },
);

export function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
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

export function buildAllocationDisplayId(id: string, allocatedAt: Date) {
  const y = allocatedAt.getFullYear().toString();
  const m = String(allocatedAt.getMonth() + 1).padStart(2, "0");
  const d = String(allocatedAt.getDate()).padStart(2, "0");

  return `ALLOC-${y}${m}${d}-${id.slice(0, 8).toUpperCase()}`;
}

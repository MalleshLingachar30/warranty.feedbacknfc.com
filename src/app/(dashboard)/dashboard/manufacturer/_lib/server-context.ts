import { db } from "@/lib/db";
import { ensureManufacturerAdmin } from "@/lib/auth";

export type ManufacturerPageContext = {
  organizationId: string | null;
  clerkUserId: string;
  dbUserId: string | null;
};

export async function resolveManufacturerPageContext(): Promise<ManufacturerPageContext> {
  const authData = await ensureManufacturerAdmin();
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
        type: "manufacturer",
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

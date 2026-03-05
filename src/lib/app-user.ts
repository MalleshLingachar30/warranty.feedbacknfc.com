import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import type { UserRole } from "@prisma/client";

import { db } from "@/lib/db";
import { parseAppRole, parseAppRoleFromClaims, type AppRole } from "@/lib/roles";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function extractUserName(clerk: unknown): string | null {
  if (!isRecord(clerk)) {
    return null;
  }

  const fullName = asString(clerk.fullName);
  if (fullName) {
    return fullName;
  }

  const firstName = asString(clerk.firstName);
  const lastName = asString(clerk.lastName);
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  return firstName ?? lastName ?? asString(clerk.username) ?? null;
}

function extractPrimaryEmail(clerk: unknown): string | null {
  if (!isRecord(clerk)) {
    return null;
  }

  const emailAddresses = Array.isArray(clerk.emailAddresses)
    ? clerk.emailAddresses
    : [];

  const primaryId = asString(clerk.primaryEmailAddressId);

  for (const entry of emailAddresses) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = asString(entry.id);
    const email = asString(entry.emailAddress);

    if (!email) {
      continue;
    }

    if (primaryId && id === primaryId) {
      return normalizeEmail(email);
    }
  }

  const fallback = emailAddresses.find((entry) => {
    if (!isRecord(entry)) {
      return false;
    }

    const email = asString(entry.emailAddress);
    return Boolean(email);
  });

  if (isRecord(fallback)) {
    const email = asString(fallback.emailAddress);
    return email ? normalizeEmail(email) : null;
  }

  return null;
}

function extractPrimaryPhone(clerk: unknown): string | null {
  if (!isRecord(clerk)) {
    return null;
  }

  const phoneNumbers = Array.isArray(clerk.phoneNumbers)
    ? clerk.phoneNumbers
    : [];

  const primaryId = asString(clerk.primaryPhoneNumberId);

  for (const entry of phoneNumbers) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = asString(entry.id);
    const phone = asString(entry.phoneNumber);

    if (!phone) {
      continue;
    }

    if (primaryId && id === primaryId) {
      return normalizePhone(phone);
    }
  }

  const fallback = phoneNumbers.find((entry) => {
    if (!isRecord(entry)) {
      return false;
    }

    const phone = asString(entry.phoneNumber);
    return Boolean(phone);
  });

  if (isRecord(fallback)) {
    const phone = asString(fallback.phoneNumber);
    return phone ? normalizePhone(phone) : null;
  }

  return null;
}

export type DbUserSnapshot = {
  id: string;
  clerkId: string;
  role: UserRole;
  organizationId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  technicianProfileId: string | null;
};

async function fetchDbUser(clerkUserId: string): Promise<DbUserSnapshot | null> {
  return db.user.findUnique({
    where: {
      clerkId: clerkUserId,
    },
    select: {
      id: true,
      clerkId: true,
      role: true,
      organizationId: true,
      email: true,
      phone: true,
      name: true,
      technicianProfile: {
        select: {
          id: true,
        },
      },
    },
  }).then((row) => {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      clerkId: row.clerkId,
      role: row.role,
      organizationId: row.organizationId,
      email: row.email,
      phone: row.phone,
      name: row.name,
      technicianProfileId: row.technicianProfile?.id ?? null,
    } satisfies DbUserSnapshot;
  });
}

export async function ensureDbUserForClerkUser(input: {
  clerkUserId: string;
  defaultRole?: UserRole;
}): Promise<DbUserSnapshot> {
  const defaultRole: UserRole = input.defaultRole ?? "customer";

  const existing = await fetchDbUser(input.clerkUserId);
  if (existing) {
    if (existing.name && existing.email && existing.phone) {
      return existing;
    }

    const clerk = await currentUser().catch(() => null);
    const name = existing.name ?? extractUserName(clerk);
    const email = existing.email ?? extractPrimaryEmail(clerk);
    const phone = existing.phone ?? extractPrimaryPhone(clerk);

    if (name === existing.name && email === existing.email && phone === existing.phone) {
      return existing;
    }

    const updated = await db.user.update({
      where: {
        id: existing.id,
      },
      data: {
        name,
        email,
        phone,
      },
      select: {
        id: true,
        clerkId: true,
        role: true,
        organizationId: true,
        email: true,
        phone: true,
        name: true,
        technicianProfile: {
          select: {
            id: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      clerkId: updated.clerkId,
      role: updated.role,
      organizationId: updated.organizationId,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
      technicianProfileId: updated.technicianProfile?.id ?? null,
    };
  }

  const clerk = await currentUser().catch(() => null);
  const created = await db.user.create({
    data: {
      clerkId: input.clerkUserId,
      role: defaultRole,
      name: extractUserName(clerk),
      email: extractPrimaryEmail(clerk),
      phone: extractPrimaryPhone(clerk),
    },
    select: {
      id: true,
      clerkId: true,
      role: true,
      organizationId: true,
      email: true,
      phone: true,
      name: true,
      technicianProfile: {
        select: {
          id: true,
        },
      },
    },
  });

  return {
    id: created.id,
    clerkId: created.clerkId,
    role: created.role,
    organizationId: created.organizationId,
    email: created.email,
    phone: created.phone,
    name: created.name,
    technicianProfileId: created.technicianProfile?.id ?? null,
  };
}

export async function resolveAppRoleForSession(input: {
  clerkUserId: string;
  sessionClaims: unknown;
}): Promise<{ role: AppRole; dbUser: DbUserSnapshot }> {
  const dbUser = await ensureDbUserForClerkUser({
    clerkUserId: input.clerkUserId,
  });

  const claimsRole = parseAppRoleFromClaims(input.sessionClaims);

  if (dbUser.role !== "customer") {
    return {
      role: parseAppRole(dbUser.role),
      dbUser,
    };
  }

  return {
    role: claimsRole,
    dbUser,
  };
}


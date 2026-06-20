import "server-only";

import { cache } from "react";
import type { UserRole } from "@prisma/client";

import { getCachedCurrentUser } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";
import {
  parseAppRole,
  parseAppRoleFromClaims,
  type AppRole,
} from "@/lib/roles";

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

function extractVerifiedEmails(clerk: unknown): string[] {
  if (!isRecord(clerk)) {
    return [];
  }

  const emailAddresses = Array.isArray(clerk.emailAddresses)
    ? clerk.emailAddresses
    : [];

  const verified = new Set<string>();

  for (const entry of emailAddresses) {
    if (!isRecord(entry)) {
      continue;
    }

    const email = asString(entry.emailAddress);
    if (!email) {
      continue;
    }

    verified.add(normalizeEmail(email));
  }

  return [...verified];
}

function extractVerifiedPhones(clerk: unknown): string[] {
  if (!isRecord(clerk)) {
    return [];
  }

  const phoneNumbers = Array.isArray(clerk.phoneNumbers)
    ? clerk.phoneNumbers
    : [];

  const verified = new Set<string>();

  for (const entry of phoneNumbers) {
    if (!isRecord(entry)) {
      continue;
    }

    const phone = asString(entry.phoneNumber);
    if (!phone) {
      continue;
    }

    verified.add(normalizePhone(phone));
  }

  return [...verified];
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

const fetchDbUser = cache(
  async (clerkUserId: string): Promise<DbUserSnapshot | null> => {
    return withDatabaseRetry(() =>
      db.user.findUnique({
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
      })
    ).then((row) => {
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
  },
);

const ensureDbUserForClerkUserCached = cache(
  async (
    clerkUserId: string,
    defaultRole: UserRole,
  ): Promise<DbUserSnapshot> => {
    const existing = await fetchDbUser(clerkUserId);
    if (existing) {
      return existing;
    }

    const clerk = await getCachedCurrentUser();
    const displayName = extractUserName(clerk);
    const verifiedEmails = extractVerifiedEmails(clerk);
    const verifiedPhones = extractVerifiedPhones(clerk);
    const primaryEmail =
      extractPrimaryEmail(clerk) ?? verifiedEmails[0] ?? null;
    const primaryPhone =
      extractPrimaryPhone(clerk) ?? verifiedPhones[0] ?? null;

    const contactOrClauses = [
      verifiedEmails.length > 0
        ? {
            email: {
              in: verifiedEmails,
            },
          }
        : null,
      verifiedPhones.length > 0
        ? {
            phone: {
              in: verifiedPhones,
            },
          }
        : null,
    ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause));

    if (contactOrClauses.length > 0) {
      const candidates = await withDatabaseRetry(() =>
        db.user.findMany({
          where: {
            isActive: true,
            OR: contactOrClauses,
          },
          select: {
            id: true,
            clerkId: true,
            role: true,
            organizationId: true,
            email: true,
            phone: true,
            name: true,
            createdAt: true,
            technicianProfile: {
              select: {
                id: true,
              },
            },
          },
        }),
      );

      const preferredCandidate =
        candidates
          .filter((candidate) => candidate.role !== "customer")
          .sort((left, right) => {
            const leftEmailMatched =
              left.email && verifiedEmails.includes(normalizeEmail(left.email));
            const rightEmailMatched =
              right.email &&
              verifiedEmails.includes(normalizeEmail(right.email));

            if (leftEmailMatched !== rightEmailMatched) {
              return leftEmailMatched ? -1 : 1;
            }

            const leftPhoneMatched =
              left.phone && verifiedPhones.includes(normalizePhone(left.phone));
            const rightPhoneMatched =
              right.phone &&
              verifiedPhones.includes(normalizePhone(right.phone));

            if (leftPhoneMatched !== rightPhoneMatched) {
              return leftPhoneMatched ? -1 : 1;
            }

            return left.createdAt.getTime() - right.createdAt.getTime();
          })[0] ??
        candidates
          .filter((candidate) => candidate.clerkId.startsWith("customer_"))
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];

      if (preferredCandidate) {
        const claimed = await withDatabaseRetry(() =>
          db.user.update({
            where: {
              id: preferredCandidate.id,
            },
            data: {
              clerkId: clerkUserId,
              name: preferredCandidate.name ?? displayName,
              email: preferredCandidate.email ?? primaryEmail,
              phone: preferredCandidate.phone ?? primaryPhone,
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
          }),
        );

        return {
          id: claimed.id,
          clerkId: claimed.clerkId,
          role: claimed.role,
          organizationId: claimed.organizationId,
          email: claimed.email,
          phone: claimed.phone,
          name: claimed.name,
          technicianProfileId: claimed.technicianProfile?.id ?? null,
        };
      }
    }

    const created = await withDatabaseRetry(() =>
      db.user.create({
        data: {
          clerkId: clerkUserId,
          role: defaultRole,
          name: displayName,
          email: primaryEmail,
          phone: primaryPhone,
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
      }),
    );

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
  },
);

export async function ensureDbUserForClerkUser(input: {
  clerkUserId: string;
  defaultRole?: UserRole;
}): Promise<DbUserSnapshot> {
  return ensureDbUserForClerkUserCached(
    input.clerkUserId,
    input.defaultRole ?? "customer",
  );
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

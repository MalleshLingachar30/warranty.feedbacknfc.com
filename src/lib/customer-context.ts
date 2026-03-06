import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { getCachedAuth, getCachedCurrentUser } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { parseAppRoleFromClaims } from "@/lib/roles";

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

function readVerificationStatus(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return asString(value.status);
}

function extractVerifiedEmails(clerkUser: unknown): string[] {
  if (!isRecord(clerkUser)) {
    return [];
  }

  const emailAddresses = Array.isArray(clerkUser.emailAddresses)
    ? clerkUser.emailAddresses
    : [];

  const verifiedEmails = new Set<string>();

  for (const entry of emailAddresses) {
    if (!isRecord(entry)) {
      continue;
    }

    const email = asString(entry.emailAddress);
    if (!email) {
      continue;
    }

    const status = readVerificationStatus(entry.verification);
    if (status !== "verified") {
      continue;
    }

    verifiedEmails.add(normalizeEmail(email));
  }

  return [...verifiedEmails];
}

function extractVerifiedPhones(clerkUser: unknown): string[] {
  if (!isRecord(clerkUser)) {
    return [];
  }

  const phoneNumbers = Array.isArray(clerkUser.phoneNumbers)
    ? clerkUser.phoneNumbers
    : [];

  const verifiedPhones = new Set<string>();

  for (const entry of phoneNumbers) {
    if (!isRecord(entry)) {
      continue;
    }

    const phone = asString(entry.phoneNumber);
    if (!phone) {
      continue;
    }

    const status = readVerificationStatus(entry.verification);
    if (status !== "verified") {
      continue;
    }

    const normalized = normalizePhone(phone);
    if (normalized.length === 0) {
      continue;
    }

    verifiedPhones.add(normalized);
  }

  return [...verifiedPhones];
}

function buildDisplayName(clerkUser: unknown): string {
  if (!isRecord(clerkUser)) {
    return "Customer";
  }

  const firstName = asString(clerkUser.firstName);
  const lastName = asString(clerkUser.lastName);

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) {
    return firstName;
  }

  const fullName = asString(clerkUser.fullName);
  if (fullName) {
    return fullName;
  }

  const username = asString(clerkUser.username);
  if (username) {
    return username;
  }

  return "Customer";
}

async function ensureCustomerUserRecord(input: {
  clerkUserId: string;
  verifiedEmails: string[];
  verifiedPhones: string[];
  displayName: string;
}) {
  const existing = await db.user.findUnique({
    where: {
      clerkId: input.clerkUserId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      languagePreference: true,
      role: true,
    },
  });

  if (existing) {
    return existing;
  }

  const contactOrClauses = [
    input.verifiedPhones.length > 0
      ? { phone: { in: input.verifiedPhones } }
      : null,
    input.verifiedEmails.length > 0
      ? { email: { in: input.verifiedEmails } }
      : null,
  ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause));

  if (contactOrClauses.length > 0) {
    const candidates = await db.user.findMany({
      where: {
        role: "customer",
        isActive: true,
        OR: contactOrClauses,
      },
      select: {
        id: true,
        clerkId: true,
        name: true,
        email: true,
        phone: true,
        languagePreference: true,
        _count: {
          select: {
            customerProducts: true,
            reportedTickets: true,
          },
        },
        createdAt: true,
      },
    });

    const claimableCandidates = candidates.filter((candidate) =>
      candidate.clerkId.startsWith("customer_"),
    );

    const bestCandidate = claimableCandidates.sort((left, right) => {
      const leftScore =
        left._count.customerProducts + left._count.reportedTickets;
      const rightScore =
        right._count.customerProducts + right._count.reportedTickets;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];

    if (bestCandidate) {
      return db.user.update({
        where: {
          id: bestCandidate.id,
        },
        data: {
          clerkId: input.clerkUserId,
          name: bestCandidate.name ?? input.displayName,
          email:
            bestCandidate.email ??
            (input.verifiedEmails.length > 0 ? input.verifiedEmails[0] : null),
          phone:
            bestCandidate.phone ??
            (input.verifiedPhones.length > 0 ? input.verifiedPhones[0] : null),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          languagePreference: true,
          role: true,
        },
      });
    }
  }

  return db.user.create({
    data: {
      clerkId: input.clerkUserId,
      role: "customer",
      name: input.displayName,
      email: input.verifiedEmails.length > 0 ? input.verifiedEmails[0] : null,
      phone: input.verifiedPhones.length > 0 ? input.verifiedPhones[0] : null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      languagePreference: true,
      role: true,
    },
  });
}

export type CustomerContext = {
  clerkUserId: string;
  dbUserId: string;
  displayName: string;
  verifiedEmails: string[];
  verifiedPhones: string[];
  languagePreference: string;
};

export const requireCustomerContext = cache(
  async (): Promise<CustomerContext> => {
    const authData = await getCachedAuth();

    if (!authData.userId) {
      authData.redirectToSignIn();
    }

    const role = parseAppRoleFromClaims(authData.sessionClaims);

    if (
      process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD !== "true" &&
      role !== "customer"
    ) {
      redirect("/dashboard?access=denied&required=customer");
    }

    const clerkUserId = authData.userId;

    if (!clerkUserId) {
      throw new Error("Authenticated clerk user id is required.");
    }

    const clerkUser = await getCachedCurrentUser();
    const verifiedEmails = clerkUser ? extractVerifiedEmails(clerkUser) : [];
    const verifiedPhones = clerkUser ? extractVerifiedPhones(clerkUser) : [];
    const displayName = clerkUser ? buildDisplayName(clerkUser) : "Customer";

    const dbUser = await ensureCustomerUserRecord({
      clerkUserId,
      verifiedEmails,
      verifiedPhones,
      displayName,
    });

    return {
      clerkUserId,
      dbUserId: dbUser.id,
      displayName: dbUser.name ?? displayName,
      verifiedEmails,
      verifiedPhones,
      languagePreference: dbUser.languagePreference ?? "en",
    };
  },
);

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { parseAppRoleFromClaims } from "@/lib/roles";
import { resolveAppRoleForSession } from "@/lib/app-user";

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

function extractEmails(clerkUser: unknown) {
  if (!isRecord(clerkUser)) {
    return [];
  }

  const emailAddresses = Array.isArray(clerkUser.emailAddresses)
    ? clerkUser.emailAddresses
    : [];

  return emailAddresses
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const emailAddress = asString(entry.emailAddress);
      if (!emailAddress) {
        return null;
      }

      return {
        emailAddress: normalizeEmail(emailAddress),
        verificationStatus: readVerificationStatus(entry.verification),
      };
    })
    .filter((entry): entry is { emailAddress: string; verificationStatus: string | null } =>
      Boolean(entry),
    );
}

function extractPhones(clerkUser: unknown) {
  if (!isRecord(clerkUser)) {
    return [];
  }

  const phoneNumbers = Array.isArray(clerkUser.phoneNumbers)
    ? clerkUser.phoneNumbers
    : [];

  return phoneNumbers
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const phoneNumber = asString(entry.phoneNumber);
      if (!phoneNumber) {
        return null;
      }

      return {
        phoneNumber: normalizePhone(phoneNumber),
        verificationStatus: readVerificationStatus(entry.verification),
      };
    })
    .filter((entry): entry is { phoneNumber: string; verificationStatus: string | null } =>
      Boolean(entry),
    );
}

function pickRoleClaims(sessionClaims: unknown) {
  if (!isRecord(sessionClaims)) {
    return null;
  }

  return {
    role: sessionClaims.role ?? null,
    orgRole: sessionClaims.org_role ?? sessionClaims.orgRole ?? null,
    orgSlug: sessionClaims.org_slug ?? sessionClaims.orgSlug ?? null,
    orgId: sessionClaims.org_id ?? sessionClaims.orgId ?? null,
    azp: sessionClaims.azp ?? null,
    metadata: isRecord(sessionClaims.metadata)
      ? {
          role: sessionClaims.metadata.role ?? null,
          roles: sessionClaims.metadata.roles ?? null,
        }
      : null,
    publicMetadata: isRecord(sessionClaims.public_metadata)
      ? {
          role: sessionClaims.public_metadata.role ?? null,
          roles: sessionClaims.public_metadata.roles ?? null,
        }
      : isRecord(sessionClaims.publicMetadata)
        ? {
            role: sessionClaims.publicMetadata.role ?? null,
            roles: sessionClaims.publicMetadata.roles ?? null,
          }
        : null,
    unsafeMetadata: isRecord(sessionClaims.unsafe_metadata)
      ? {
          role: sessionClaims.unsafe_metadata.role ?? null,
          roles: sessionClaims.unsafe_metadata.roles ?? null,
        }
      : isRecord(sessionClaims.unsafeMetadata)
        ? {
            role: sessionClaims.unsafeMetadata.role ?? null,
            roles: sessionClaims.unsafeMetadata.roles ?? null,
          }
        : null,
  };
}

export async function GET() {
  const authData = await auth();

  if (!authData.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerkUser = await currentUser().catch(() => null);
  const resolved = await resolveAppRoleForSession({
    clerkUserId: authData.userId,
    sessionClaims: authData.sessionClaims,
  });

  const emails = extractEmails(clerkUser);
  const phones = extractPhones(clerkUser);

  const dbUserByClerkId = await db.user.findUnique({
    where: {
      clerkId: authData.userId,
    },
    select: {
      id: true,
      clerkId: true,
      role: true,
      email: true,
      phone: true,
      organizationId: true,
      technicianProfile: {
        select: {
          id: true,
        },
      },
    },
  });

  const contactMatches =
    emails.length > 0 || phones.length > 0
      ? await db.user.findMany({
          where: {
            OR: [
              ...(emails.length > 0
                ? [
                    {
                      email: {
                        in: emails.map((entry) => entry.emailAddress),
                      },
                    },
                  ]
                : []),
              ...(phones.length > 0
                ? [
                    {
                      phone: {
                        in: phones.map((entry) => entry.phoneNumber),
                      },
                    },
                  ]
                : []),
            ],
          },
          select: {
            id: true,
            clerkId: true,
            role: true,
            email: true,
            phone: true,
            organizationId: true,
            technicianProfile: {
              select: {
                id: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        })
      : [];

  return NextResponse.json({
    auth: {
      userId: authData.userId,
      orgId: authData.orgId ?? null,
      orgRole: authData.orgRole ?? null,
      parsedClaimsRole: parseAppRoleFromClaims(authData.sessionClaims),
      claims: pickRoleClaims(authData.sessionClaims),
    },
    currentUser: clerkUser
      ? {
          id: clerkUser.id,
          primaryEmailAddressId: clerkUser.primaryEmailAddressId ?? null,
          primaryPhoneNumberId: clerkUser.primaryPhoneNumberId ?? null,
          publicMetadata: clerkUser.publicMetadata ?? null,
          unsafeMetadata: clerkUser.unsafeMetadata ?? null,
          emailAddresses: emails,
          phoneNumbers: phones,
        }
      : null,
    resolved,
    dbUserByClerkId,
    contactMatches,
  });
}

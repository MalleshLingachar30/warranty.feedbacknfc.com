import crypto from "node:crypto";

import { OrganizationType, UserRole, type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sendInstallInviteIfNeeded } from "@/lib/install-app-invite";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireSuperAdminContext,
} from "../_utils";

type AdminInput = {
  clerkId?: unknown;
  email?: unknown;
  name?: unknown;
};

type CreateManufacturerPayload = {
  action: "create_manufacturer";
  organization?: unknown;
  admin?: unknown;
};

type CreateServiceCenterPayload = {
  action: "create_service_center";
  organization?: unknown;
  center?: unknown;
  admin?: unknown;
};

type AssignAdminPayload = {
  action: "assign_admin";
  organizationId?: unknown;
  adminRole?: unknown;
  admin?: unknown;
};

type OnboardingPayload =
  | CreateManufacturerPayload
  | CreateServiceCenterPayload
  | AssignAdminPayload;

type OrganizationListRow = {
  id: string;
  name: string;
  type: OrganizationType;
  slug: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  pincode: string | null;
  subscriptionTier: string;
  subscriptionExpiresAt: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  adminMembers: Array<{
    id: string;
    name: string;
    email: string;
    clerkId: string;
    role: UserRole;
  }>;
  linkedManufacturerIds: string[];
  linkedManufacturerNames: string[];
  serviceCenterBranches: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    address: string | null;
    pincode: string | null;
    phone: string | null;
    email: string | null;
    supportedCategories: string[];
  }>;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function asOrganizationType(value: unknown): OrganizationType | null {
  if (
    value === "manufacturer" ||
    value === "distributor" ||
    value === "service_center" ||
    value === "retailer"
  ) {
    return value;
  }

  return null;
}

function asAdminRole(value: unknown): UserRole | null {
  if (value === "manufacturer_admin" || value === "service_center_admin") {
    return value;
  }

  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function generateUniqueSlug(tx: Prisma.TransactionClient, name: string) {
  const base = slugify(name).slice(0, 84) || "organization";
  let candidate = base;
  let suffix = 1;

  while (true) {
    const existing = await tx.organization.findUnique({
      where: {
        slug: candidate,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base.slice(0, 84)}-${suffix}`.slice(0, 100);
  }
}

async function assignAdminToOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
  adminRole: UserRole,
  input: AdminInput | null,
) {
  if (!input) {
    return null;
  }

  const clerkId = asString(input.clerkId);
  const email = asString(input.email);
  const name = asString(input.name);

  if (!clerkId && !email) {
    return null;
  }

  let user: {
    id: string;
    clerkId: string;
    email: string | null;
    name: string | null;
  } | null = null;

  if (clerkId) {
    user = await tx.user.upsert({
      where: {
        clerkId,
      },
      update: {
        organizationId,
        role: adminRole,
        isActive: true,
        email: email ?? undefined,
        name: name ?? undefined,
      },
      create: {
        clerkId,
        organizationId,
        role: adminRole,
        isActive: true,
        email,
        name,
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
      },
    });
  } else if (email) {
    const existing = await tx.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        clerkId: true,
      },
    });

    if (!existing) {
      throw new ApiError(
        "Admin email was not found in existing users. Provide Clerk user ID or have the admin sign in once first.",
        404,
      );
    }

    user = await tx.user.update({
      where: {
        id: existing.id,
      },
      data: {
        organizationId,
        role: adminRole,
        isActive: true,
        email,
        name: name ?? undefined,
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
      },
    });
  }

  return user;
}

async function buildOrganizationRows(): Promise<OrganizationListRow[]> {
  const [organizations, adminUsers, centers] = await Promise.all([
    db.organization.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
      select: {
        id: true,
        name: true,
        type: true,
        slug: true,
        address: true,
        city: true,
        state: true,
        country: true,
        pincode: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
      },
    }),
    db.user.findMany({
      where: {
        organizationId: {
          not: null,
        },
        role: {
          in: ["manufacturer_admin", "service_center_admin"],
        },
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        email: true,
        clerkId: true,
        role: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    db.serviceCenter.findMany({
      select: {
        id: true,
        organizationId: true,
        name: true,
        city: true,
        state: true,
        address: true,
        pincode: true,
        phone: true,
        email: true,
        supportedCategories: true,
        manufacturerAuthorizations: true,
      },
    }),
  ]);

  const organizationsById = new Map(organizations.map((org) => [org.id, org]));
  const adminMap = new Map<
    string,
    Array<{
      id: string;
      name: string;
      email: string;
      clerkId: string;
      role: UserRole;
    }>
  >();

  for (const admin of adminUsers) {
    const orgId = admin.organizationId;
    if (!orgId) {
      continue;
    }

    const current = adminMap.get(orgId) ?? [];
    current.push({
      id: admin.id,
      name: admin.name ?? "",
      email: admin.email ?? "",
      clerkId: admin.clerkId,
      role: admin.role,
    });
    adminMap.set(orgId, current);
  }

  const manufacturerLinksByOrg = new Map<string, string[]>();
  const branchesByOrg = new Map<
    string,
    Array<{
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      address: string | null;
      pincode: string | null;
      phone: string | null;
      email: string | null;
      supportedCategories: string[];
    }>
  >();
  for (const center of centers) {
    const current = manufacturerLinksByOrg.get(center.organizationId) ?? [];
    current.push(...center.manufacturerAuthorizations);
    manufacturerLinksByOrg.set(
      center.organizationId,
      Array.from(new Set(current)),
    );

    const branchRows = branchesByOrg.get(center.organizationId) ?? [];
    branchRows.push({
      id: center.id,
      name: center.name,
      city: center.city,
      state: center.state,
      address: center.address,
      pincode: center.pincode,
      phone: center.phone,
      email: center.email,
      supportedCategories: center.supportedCategories,
    });
    branchesByOrg.set(center.organizationId, branchRows);
  }

  return organizations.map((org) => {
    const linkedManufacturerIds = manufacturerLinksByOrg.get(org.id) ?? [];
    return {
      id: org.id,
      name: org.name,
      type: org.type,
      slug: org.slug,
      address: org.address,
      city: org.city,
      state: org.state,
      country: org.country,
      pincode: org.pincode,
      subscriptionTier: org.subscriptionTier,
      subscriptionExpiresAt: org.subscriptionExpiresAt
        ? org.subscriptionExpiresAt.toISOString()
        : null,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      createdAt: org.createdAt.toISOString(),
      adminMembers: adminMap.get(org.id) ?? [],
      linkedManufacturerIds,
      linkedManufacturerNames: linkedManufacturerIds
        .map((id) => organizationsById.get(id)?.name ?? "")
        .filter((name) => name.length > 0),
      serviceCenterBranches: branchesByOrg.get(org.id) ?? [],
    };
  });
}

export async function POST(request: Request) {
  try {
    await requireSuperAdminContext();
    const body = parseJsonBody<OnboardingPayload>(await request.json());
    let invitedAdminUserId: string | null = null;

    if (body.action === "create_manufacturer") {
      const orgInput =
        body.organization && typeof body.organization === "object"
          ? (body.organization as Record<string, unknown>)
          : {};

      const name = asString(orgInput.name);
      if (!name) {
        throw new ApiError("Manufacturer name is required.", 400);
      }

      await db.$transaction(async (tx) => {
        const slug = await generateUniqueSlug(tx, name);
        const organization = await tx.organization.create({
          data: {
            id: crypto.randomUUID(),
            name,
            type: "manufacturer",
            slug,
            city: asString(orgInput.city),
            state: asString(orgInput.state),
            country: asString(orgInput.country) ?? "IN",
            address: asString(orgInput.address),
            pincode: asString(orgInput.pincode),
            contactEmail: asString(orgInput.contactEmail),
            contactPhone: asString(orgInput.contactPhone),
          },
          select: {
            id: true,
          },
        });

        await assignAdminToOrganization(
          tx,
          organization.id,
          "manufacturer_admin",
          body.admin && typeof body.admin === "object"
            ? (body.admin as AdminInput)
            : null,
        );
      });
    } else if (body.action === "create_service_center") {
      const orgInput =
        body.organization && typeof body.organization === "object"
          ? (body.organization as Record<string, unknown>)
          : {};
      const centerInput =
        body.center && typeof body.center === "object"
          ? (body.center as Record<string, unknown>)
          : {};

      const organizationName = asString(orgInput.name);
      const centerName = asString(centerInput.name) ?? organizationName;
      const city = asString(centerInput.city) ?? asString(orgInput.city);

      if (!organizationName) {
        throw new ApiError(
          "Service-center organization name is required.",
          400,
        );
      }

      if (!centerName) {
        throw new ApiError("Service-center branch name is required.", 400);
      }

      if (!city) {
        throw new ApiError("Service-center city is required.", 400);
      }

      const manufacturerOrganizationIds = parseStringArray(
        centerInput.manufacturerOrganizationIds,
      );

      await db.$transaction(async (tx) => {
        const slug = await generateUniqueSlug(tx, organizationName);
        const organization = await tx.organization.create({
          data: {
            id: crypto.randomUUID(),
            name: organizationName,
            type: "service_center",
            slug,
            city: asString(orgInput.city),
            state: asString(orgInput.state),
            country: asString(orgInput.country) ?? "IN",
            address: asString(orgInput.address),
            pincode: asString(orgInput.pincode),
            contactEmail: asString(orgInput.contactEmail),
            contactPhone: asString(orgInput.contactPhone),
          },
          select: {
            id: true,
          },
        });

        await tx.serviceCenter.create({
          data: {
            id: crypto.randomUUID(),
            organizationId: organization.id,
            name: centerName,
            city,
            state: asString(centerInput.state) ?? asString(orgInput.state),
            address:
              asString(centerInput.address) ?? asString(orgInput.address),
            pincode:
              asString(centerInput.pincode) ?? asString(orgInput.pincode),
            phone:
              asString(centerInput.phone) ?? asString(orgInput.contactPhone),
            email:
              asString(centerInput.email) ?? asString(orgInput.contactEmail),
            serviceRadiusKm: 50,
            supportedCategories: parseStringArray(
              centerInput.supportedCategories,
            ),
            manufacturerAuthorizations: manufacturerOrganizationIds,
            isActive: true,
          },
        });

        const assignedAdmin = await assignAdminToOrganization(
          tx,
          organization.id,
          "service_center_admin",
          body.admin && typeof body.admin === "object"
            ? (body.admin as AdminInput)
            : null,
        );

        invitedAdminUserId = assignedAdmin?.id ?? null;
      });
    } else if (body.action === "assign_admin") {
      const organizationId = asString(body.organizationId);
      const adminRole = asAdminRole(body.adminRole);

      if (!organizationId) {
        throw new ApiError("Organization is required.", 400);
      }

      if (!adminRole) {
        throw new ApiError("Valid admin role is required.", 400);
      }

      const organization = await db.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          id: true,
          type: true,
        },
      });

      if (!organization) {
        throw new ApiError("Organization not found.", 404);
      }

      if (
        (organization.type === "manufacturer" &&
          adminRole !== "manufacturer_admin") ||
        (organization.type === "service_center" &&
          adminRole !== "service_center_admin")
      ) {
        throw new ApiError(
          "Selected admin role does not match the organization type.",
          400,
        );
      }

      await db.$transaction(async (tx) => {
        const assignedAdmin = await assignAdminToOrganization(
          tx,
          organizationId,
          adminRole,
          body.admin && typeof body.admin === "object"
            ? (body.admin as AdminInput)
            : null,
        );

        if (adminRole === "service_center_admin") {
          invitedAdminUserId = assignedAdmin?.id ?? null;
        }
      });
    } else {
      throw new ApiError("Unsupported onboarding action.", 400);
    }

    if (invitedAdminUserId) {
      void sendInstallInviteIfNeeded({
        userId: invitedAdminUserId,
        role: "service_center_admin",
      }).catch((error) => {
        console.error("Failed to send service-center install invite", error);
      });
    }

    const organizations = await buildOrganizationRows();

    return NextResponse.json({
      organizations,
    });
  } catch (error) {
    return jsonError(error);
  }
}

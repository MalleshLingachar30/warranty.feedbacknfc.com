import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { ComingSoonCard } from "@/components/dashboard/coming-soon-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { requireCustomerContext } from "@/lib/customer-context";

import { resolveServiceCenterPageContext } from "../_lib/service-center-context";

const CustomerSettingsClient = dynamic(
  () =>
    import("@/components/customer/customer-settings-client").then(
      (mod) => mod.CustomerSettingsClient,
    ),
  {
    loading: () => <ClientPageLoading rows={4} />,
  },
);

const ServiceCenterSettingsClient = dynamic(
  () =>
    import("@/components/service-center/settings-client").then(
      (mod) => mod.ServiceCenterSettingsClient,
    ),
  {
    loading: () => <ClientPageLoading rows={7} />,
  },
);

const SuperAdminOrganizationsClient = dynamic(
  () =>
    import("@/components/dashboard/super-admin-organizations-client").then(
      (mod) => mod.SuperAdminOrganizationsClient,
    ),
  {
    loading: () => <ClientPageLoading rows={7} />,
  },
);

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function normalizeSettings(value: unknown) {
  const source = isRecord(value) ? value : {};
  const notifications = isRecord(source.notifications)
    ? source.notifications
    : {};

  return {
    notifications: {
      smsEnabled: asBoolean(notifications.smsEnabled, true),
      emailEnabled: asBoolean(notifications.emailEnabled, true),
      whatsappEnabled: asBoolean(notifications.whatsappEnabled, false),
      notifyOnSlaBreach: asBoolean(notifications.notifyOnSlaBreach, true),
      dailyDigest: asBoolean(notifications.dailyDigest, false),
    },
  };
}

export default async function SettingsPage() {
  const { userId, sessionClaims } = await getCachedAuth();

  if (!userId) {
    return (
      <ComingSoonCard
        title="Settings"
        description="Sign in to manage your account settings."
      />
    );
  }

  const { role } = await resolveAppRoleForSession({
    clerkUserId: userId,
    sessionClaims,
  });

  if (role === "customer") {
    const context = await requireCustomerContext();

    const user = await db.user.findUnique({
      where: {
        id: context.dbUserId,
      },
      select: {
        name: true,
        email: true,
        phone: true,
        languagePreference: true,
      },
    });

    return (
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Manage profile and notification preferences."
        />
        <CustomerSettingsClient
          initialLanguage={
            user?.languagePreference ?? context.languagePreference
          }
          profile={{
            name: user?.name ?? context.displayName,
            email: user?.email ?? context.verifiedEmails[0] ?? "",
            phone: user?.phone ?? context.verifiedPhones[0] ?? "",
          }}
        />
      </div>
    );
  }

  if (role === "technician") {
    const technicianUser = await db.user.findUnique({
      where: {
        clerkId: userId,
      },
      select: {
        name: true,
        phone: true,
        email: true,
        technicianProfile: {
          select: {
            id: true,
            skills: true,
            isAvailable: true,
            activeJobCount: true,
            maxConcurrentJobs: true,
            serviceCenter: {
              select: {
                name: true,
                city: true,
                state: true,
              },
            },
          },
        },
      },
    });

    return (
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Technician profile and availability information."
        />

        {!technicianUser?.technicianProfile ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-base text-amber-950">
                Technician profile not linked
              </CardTitle>
              <CardDescription className="text-amber-900/80">
                This account does not have a technician record yet. Ask your
                service center admin to add you, or seed technician data in the
                database.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Technician profile</CardTitle>
              <CardDescription>
                {technicianUser.technicianProfile.serviceCenter.name}
                {technicianUser.technicianProfile.serviceCenter.city
                  ? ` • ${technicianUser.technicianProfile.serviceCenter.city}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-medium text-slate-900">Name:</span>{" "}
                {technicianUser.name ?? "—"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Phone:</span>{" "}
                {technicianUser.phone ?? "—"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Email:</span>{" "}
                {technicianUser.email ?? "—"}
              </p>
              <p>
                <span className="font-medium text-slate-900">
                  Availability:
                </span>{" "}
                {technicianUser.technicianProfile.isAvailable ? (
                  <Badge className="ml-2 bg-emerald-600 text-white">
                    Available
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 border-slate-300">
                    Unavailable
                  </Badge>
                )}
              </p>
              <p>
                <span className="font-medium text-slate-900">Active jobs:</span>{" "}
                {technicianUser.technicianProfile.activeJobCount} /{" "}
                {technicianUser.technicianProfile.maxConcurrentJobs}
              </p>
              <p>
                <span className="font-medium text-slate-900">Skills:</span>{" "}
                {technicianUser.technicianProfile.skills.length > 0
                  ? technicianUser.technicianProfile.skills.join(", ")
                  : "—"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (role === "super_admin") {
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
          country: true,
          city: true,
          state: true,
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

    const organizationsById = new Map(
      organizations.map((org) => [org.id, org]),
    );
    const adminMap = new Map<string, typeof adminUsers>();

    for (const admin of adminUsers) {
      const orgId = admin.organizationId;
      if (!orgId) {
        continue;
      }

      const current = adminMap.get(orgId) ?? [];
      current.push(admin);
      adminMap.set(orgId, current);
    }

    const manufacturerLinksByOrg = new Map<string, string[]>();
    for (const center of centers) {
      const current = manufacturerLinksByOrg.get(center.organizationId) ?? [];
      current.push(...center.manufacturerAuthorizations);
      manufacturerLinksByOrg.set(
        center.organizationId,
        Array.from(new Set(current)),
      );
    }

    return (
      <SuperAdminOrganizationsClient
        initialOrganizations={organizations.map((org) => {
          const linkedManufacturerIds =
            manufacturerLinksByOrg.get(org.id) ?? [];

          return {
            id: org.id,
            name: org.name,
            type: org.type,
            slug: org.slug,
            address: org.address ?? null,
            city: org.city,
            state: org.state,
            country: org.country,
            pincode: org.pincode ?? null,
            subscriptionTier: org.subscriptionTier,
            subscriptionExpiresAt: org.subscriptionExpiresAt
              ? org.subscriptionExpiresAt.toISOString()
              : null,
            contactEmail: org.contactEmail,
            contactPhone: org.contactPhone,
            createdAt: org.createdAt.toISOString(),
            adminMembers: (adminMap.get(org.id) ?? []).map((admin) => ({
              id: admin.id,
              name: admin.name ?? "",
              email: admin.email ?? "",
              clerkId: admin.clerkId,
              role: admin.role,
            })),
            linkedManufacturerIds,
            linkedManufacturerNames: linkedManufacturerIds
              .map((id) => organizationsById.get(id)?.name ?? "")
              .filter((name) => name.length > 0),
            serviceCenterBranches: centers
              .filter((center) => center.organizationId === org.id)
              .map((center) => ({
                id: center.id,
                name: center.name,
                city: center.city ?? null,
                state: center.state ?? null,
                address: center.address ?? null,
                pincode: center.pincode ?? null,
                phone: center.phone ?? null,
                email: center.email ?? null,
                supportedCategories: center.supportedCategories,
              })),
          };
        })}
      />
    );
  }

  if (role !== "service_center_admin") {
    return (
      <ComingSoonCard
        title="Settings"
        description="Role-specific settings panels for this dashboard are being expanded."
      />
    );
  }

  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [organization, centers] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        city: true,
        state: true,
        country: true,
        pincode: true,
        settings: true,
      },
    }),
    db.serviceCenter.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
        email: true,
        serviceRadiusKm: true,
        supportedCategories: true,
        operatingHours: true,
        isActive: true,
      },
    }),
  ]);

  if (!organization) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Service-center organization record was not found.
      </div>
    );
  }

  return (
    <ServiceCenterSettingsClient
      initialOrganization={{
        id: organization.id,
        name: organization.name,
        contactEmail: organization.contactEmail ?? "",
        contactPhone: organization.contactPhone ?? "",
        address: organization.address ?? "",
        city: organization.city ?? "",
        state: organization.state ?? "",
        country: organization.country ?? "IN",
        pincode: organization.pincode ?? "",
      }}
      initialSettings={normalizeSettings(organization.settings)}
      initialCenters={centers.map((center) => ({
        id: center.id,
        name: center.name,
        address: center.address ?? "",
        city: center.city ?? "",
        state: center.state ?? "",
        pincode: center.pincode ?? "",
        phone: center.phone ?? "",
        email: center.email ?? "",
        serviceRadiusKm: center.serviceRadiusKm,
        supportedCategories: center.supportedCategories,
        operatingHours:
          center.operatingHours && typeof center.operatingHours === "object"
            ? (center.operatingHours as Record<string, unknown>)
            : null,
        isActive: center.isActive,
      }))}
    />
  );
}

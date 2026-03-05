import { auth } from "@clerk/nextjs/server";

import { ComingSoonCard } from "@/components/dashboard/coming-soon-card";
import { CustomerSettingsClient } from "@/components/customer/customer-settings-client";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { ServiceCenterSettingsClient } from "@/components/service-center/settings-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { db } from "@/lib/db";
import { requireCustomerContext } from "@/lib/customer-context";

import { resolveServiceCenterPageContext } from "../_lib/service-center-context";

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
  const notifications = isRecord(source.notifications) ? source.notifications : {};

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
  const { userId, sessionClaims } = await auth();

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
          initialLanguage={user?.languagePreference ?? context.languagePreference}
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
    const authData = await auth();

    if (!authData.userId) {
      authData.redirectToSignIn();
    }

    const technicianUser = authData.userId
      ? await db.user.findUnique({
          where: {
            clerkId: authData.userId,
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
        })
      : null;

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
                <span className="font-medium text-slate-900">Availability:</span>{" "}
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
    const organizations = await db.organization.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      select: {
        id: true,
        name: true,
        type: true,
        slug: true,
        country: true,
        city: true,
        state: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
      },
    });

    return (
      <div className="space-y-6">
        <PageHeader
          title="Organizations"
          description="Platform organizations linked to the warranty system."
        />

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Organizations</CardTitle>
            <CardDescription>Showing the most recent 100 records.</CardDescription>
          </CardHeader>
          <CardContent>
            {organizations.length === 0 ? (
              <p className="text-sm text-slate-600">No organizations found.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell className="min-w-[220px]">
                          <p className="font-medium text-slate-900">{org.name}</p>
                          <p className="text-xs text-slate-500">
                            {org.slug ? org.slug : org.id.slice(0, 8)}
                            {org.city ? ` • ${org.city}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="border-slate-200 bg-slate-50">
                            {org.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-slate-600">
                          {org.subscriptionTier}
                          {org.subscriptionExpiresAt ? (
                            <p className="text-xs text-slate-500">
                              Expires {org.subscriptionExpiresAt.toLocaleDateString("en-IN")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="min-w-[200px] text-sm text-slate-600">
                          <p>{org.contactPhone ?? "—"}</p>
                          <p className="text-xs text-slate-500">
                            {org.contactEmail ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-slate-600">
                          {org.createdAt.toLocaleDateString("en-IN")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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

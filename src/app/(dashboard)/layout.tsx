import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    const { userId, sessionClaims } = await getCachedAuth();

    if (!userId) {
      redirect("/sign-in");
    }

    const { role, dbUser } = await resolveAppRoleForSession({
      clerkUserId: userId,
      sessionClaims,
    });

    const organizationId = dbUser?.organizationId ?? null;

    const organizationName = organizationId
      ? (
          await withDatabaseRetry(() =>
            db.organization.findUnique({
              where: {
                id: organizationId,
              },
              select: {
                name: true,
              },
            }),
          )
        )?.name ?? null
      : null;

    return (
      <DashboardShell
        role={role}
        organizationName={organizationName ?? undefined}
        userDisplayName={dbUser?.name ?? undefined}
      >
        {children}
      </DashboardShell>
    );
  } catch (error) {
    console.error("DashboardLayout render failed", error);
    throw error;
  }
}

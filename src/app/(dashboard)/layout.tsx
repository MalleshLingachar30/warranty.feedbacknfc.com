import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth, getCachedCurrentUser } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { withDatabaseRetry } from "@/lib/db-retry";
import { parseAppRoleFromClaims } from "@/lib/roles";

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

    const claimsRole = parseAppRoleFromClaims(sessionClaims);
    const clerkUser =
      claimsRole === "customer" ? await getCachedCurrentUser() : null;
    const clerkRole = clerkUser
      ? parseAppRoleFromClaims(clerkUser)
      : "customer";
    const resolvedSession =
      claimsRole !== "customer"
        ? {
            role: claimsRole,
            dbUser: null,
          }
        : clerkRole !== "customer"
          ? {
              role: clerkRole,
              dbUser: null,
            }
          : await resolveAppRoleForSession({
              clerkUserId: userId,
              sessionClaims,
            });

    const { role, dbUser } = resolvedSession;

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

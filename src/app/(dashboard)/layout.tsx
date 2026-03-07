import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId, sessionClaims } = await getCachedAuth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { role, dbUser } = await resolveAppRoleForSession({
    clerkUserId: userId,
    sessionClaims,
  });

  const organizationName = dbUser.organizationId
    ? (
        await db.organization.findUnique({
          where: {
            id: dbUser.organizationId,
          },
          select: {
            name: true,
          },
        })
      )?.name ?? null
    : null;

  return (
    <DashboardShell role={role} organizationName={organizationName}>
      {children}
    </DashboardShell>
  );
}

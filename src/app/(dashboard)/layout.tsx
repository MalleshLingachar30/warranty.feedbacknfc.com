import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth } from "@/lib/clerk-session";

export const dynamic = "force-dynamic";

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

  return (
    <DashboardShell
      role={role}
      organizationName={dbUser.organizationName ?? undefined}
      userDisplayName={dbUser?.name ?? undefined}
    >
      {children}
    </DashboardShell>
  );
}

import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth } from "@/lib/clerk-session";

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

    return (
      <DashboardShell
        role={role}
        organizationName={dbUser.organizationName ?? undefined}
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

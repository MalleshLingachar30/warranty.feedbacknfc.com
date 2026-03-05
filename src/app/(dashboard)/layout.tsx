import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { resolveAppRoleForSession } from "@/lib/app-user";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { role } = await resolveAppRoleForSession({
    clerkUserId: userId,
    sessionClaims,
  });

  return <DashboardShell role={role}>{children}</DashboardShell>;
}

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { parseAppRoleFromClaims } from "@/lib/roles";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const role = parseAppRoleFromClaims(sessionClaims);

  return <DashboardShell role={role}>{children}</DashboardShell>;
}

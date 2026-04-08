import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { getCachedAuth } from "@/lib/clerk-session";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { DevRoleSwitcher } from "@/components/dashboard/dev-role-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NAVIGATION_BY_ROLE, getRoleLabel } from "@/lib/roles";

export default async function DashboardPage() {
  const { userId, sessionClaims } = await getCachedAuth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { role } = await resolveAppRoleForSession({
    clerkUserId: userId,
    sessionClaims,
  });
  const navItems = NAVIGATION_BY_ROLE[role] ?? [];
  const workspaceItems = navItems.filter((item) => item.href !== "/dashboard");

  if (role === "manufacturer_admin") {
    redirect("/dashboard/manufacturer");
  }

  if (role === "customer") {
    redirect("/dashboard/customer");
  }

  if (role === "super_admin") {
    redirect("/dashboard/settings");
  }

  const showDevRoleSwitcher = process.env.NODE_ENV === "development";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Dashboard
        </h1>
        <p className="text-sm text-slate-600">
          {getRoleLabel(role)} quick navigation
        </p>
      </div>
      {showDevRoleSwitcher ? <DevRoleSwitcher currentRole={role} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {workspaceItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Icon className="h-4 w-4 text-indigo-600" />
                  {item.label}
                </span>
                <ArrowRightIcon className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

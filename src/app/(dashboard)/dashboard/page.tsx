import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DevRoleSwitcher } from "@/components/dashboard/dev-role-switcher";
import { ComingSoonCard } from "@/components/dashboard/coming-soon-card";
import { getRoleLabel, parseAppRoleFromClaims } from "@/lib/roles";

export default async function DashboardPage() {
  const { sessionClaims } = await auth();
  const role = parseAppRoleFromClaims(sessionClaims);

  if (role === "manufacturer_admin") {
    redirect("/dashboard/manufacturer");
  }

  const showDevRoleSwitcher = process.env.NODE_ENV === "development";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Dashboard
        </h1>
        <p className="text-sm text-slate-600">{getRoleLabel(role)} overview</p>
      </div>
      {showDevRoleSwitcher ? <DevRoleSwitcher currentRole={role} /> : null}
      <ComingSoonCard
        title="Role-Based Dashboard Overview"
        description="Analytics widgets and operational summaries are being wired in the next phase."
      />
    </div>
  );
}

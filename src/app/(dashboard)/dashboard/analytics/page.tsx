import { redirect } from "next/navigation";

import { getCachedAuth, getCachedCurrentUser } from "@/lib/clerk-session";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { ComingSoonCard } from "@/components/dashboard/coming-soon-card";
import { parseAppRoleFromClaims } from "@/lib/roles";

export default async function AnalyticsPage() {
  const { userId, sessionClaims } = await getCachedAuth();

  if (!userId) {
    redirect("/sign-in");
  }

  const claimsRole = parseAppRoleFromClaims(sessionClaims);
  const clerkUser =
    claimsRole === "customer" ? await getCachedCurrentUser() : null;
  const clerkRole = clerkUser ? parseAppRoleFromClaims(clerkUser) : "customer";
  const role =
    claimsRole !== "customer"
      ? claimsRole
      : clerkRole !== "customer"
        ? clerkRole
        : (
            await resolveAppRoleForSession({
              clerkUserId: userId,
              sessionClaims,
            })
          ).role;

  if (role === "manufacturer_admin") {
    redirect("/dashboard/manufacturer/analytics");
  }

  if (role === "service_center_admin") {
    redirect("/dashboard/service-center/analytics");
  }

  if (role === "technician") {
    redirect("/dashboard/my-performance");
  }

  return (
    <ComingSoonCard
      title="Analytics"
      description="Role-based analytics are available for manufacturers and service centers. This workspace will expand for other roles next."
    />
  );
}

import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth } from "@/lib/clerk-session";

const PmNotificationCenter = dynamic(
  () =>
    import("@/components/notifications/pm-notification-center").then(
      (mod) => mod.PmNotificationCenter,
    ),
  {
    loading: () => <ClientPageLoading rows={8} />,
  },
);

export default async function NotificationsPage() {
  const { userId, sessionClaims } = await getCachedAuth();

  if (!userId) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-900">Sign-in required</CardTitle>
          <CardDescription className="text-amber-800">
            Sign in to view your PM notification inbox.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { role } = await resolveAppRoleForSession({
    clerkUserId: userId,
    sessionClaims,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Review preventive maintenance schedule, assignment, start, completion, and cancellation updates."
      />
      <PmNotificationCenter role={role} />
    </div>
  );
}

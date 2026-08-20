import dynamic from "next/dynamic";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { getCachedAuth } from "@/lib/clerk-session";
import { canDispatchPreventiveMaintenanceNotifications } from "@/lib/preventive-maintenance-notification-dispatch";

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
            Sign in to view your maintenance updates.
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
        title="Maintenance Updates"
        description="Review service reminders, assignment changes, and visit progress in one place."
        actions={
          canDispatchPreventiveMaintenanceNotifications(role) ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/notifications/reporting">
                <BarChart3 data-icon="inline-start" />
                Reports
              </Link>
            </Button>
          ) : null
        }
      />
      <PmNotificationCenter role={role} />
    </div>
  );
}

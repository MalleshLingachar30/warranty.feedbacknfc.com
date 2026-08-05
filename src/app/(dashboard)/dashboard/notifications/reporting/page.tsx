import { PageHeader } from "@/components/dashboard/page-header";
import { PmNotificationReportingDashboard } from "@/components/notifications/pm-notification-reporting-dashboard";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getPmNotificationReporting,
  resolvePmNotificationReportingAudience,
} from "@/lib/preventive-maintenance-notification-reporting";
import {
  parsePmNotificationReportingFilters,
  PmNotificationReportingFilterError,
} from "@/lib/preventive-maintenance-notification-reporting-policy";
import { PreventiveMaintenanceNotificationApiError } from "@/lib/preventive-maintenance-notifications";

type ReportingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toUrlSearchParams(
  values: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      params.set(key, value[0]);
    }
  }

  return params;
}

export default async function PmNotificationReportingPage({
  searchParams,
}: ReportingPageProps) {
  let audience;
  try {
    audience = await resolvePmNotificationReportingAudience();
  } catch (error) {
    if (error instanceof PreventiveMaintenanceNotificationApiError) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader
            title="PM notification reporting"
            description="Operational analytics are limited to authorized PM notification operators."
          />
          <Card>
            <CardHeader>
              <CardTitle>Reporting access required</CardTitle>
              <CardDescription>
                Your current role cannot view PM notification delivery and
                scheduler reporting.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    throw error;
  }

  const values = (await searchParams) ?? {};
  let filterError: string | null = null;
  let filters;

  try {
    filters = parsePmNotificationReportingFilters(toUrlSearchParams(values));
  } catch (error) {
    if (!(error instanceof PmNotificationReportingFilterError)) {
      throw error;
    }

    filterError = error.message;
    filters = parsePmNotificationReportingFilters(new URLSearchParams());
  }

  const reporting = await getPmNotificationReporting({ audience, filters });

  return (
    <PmNotificationReportingDashboard
      reporting={reporting}
      filterError={filterError}
    />
  );
}

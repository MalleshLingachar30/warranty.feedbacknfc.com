import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveManufacturerPageContext } from "@/app/(dashboard)/dashboard/manufacturer/_lib/server-context";
import { getPreventiveMaintenanceDemoReadiness } from "@/lib/preventive-maintenance-demo-readiness";

type DisplayStatus = "pass" | "warn" | "fail";

const statusStyles = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  fail: "border-rose-200 bg-rose-50 text-rose-700",
} as const;

const statusLabels = {
  pass: "Ready",
  warn: "Needs attention",
  fail: "Not ready",
} as const;

function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {statusLabels[status]}
    </Badge>
  );
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function statusById(
  checks: Awaited<
    ReturnType<typeof getPreventiveMaintenanceDemoReadiness>
  >["checks"],
  id: string,
) {
  return checks.find((check) => check.id === id)?.status ?? "fail";
}

function automaticReminderLabel(mode: string) {
  if (mode === "live") {
    return "Sending";
  }

  if (mode === "dry_run") {
    return "Review only";
  }

  return "Paused";
}

export default async function ManufacturerDemoOpsPage() {
  const context = await resolveManufacturerPageContext();
  const readiness = await getPreventiveMaintenanceDemoReadiness({
    organizationId: context.organizationId,
  });
  const businessChecks = [
    {
      id: "correct_account",
      label: "Correct customer account",
      status: statusById(readiness.checks, "medcore_tenant"),
      detail: "The workspace is set to the MedCore customer account.",
    },
    {
      id: "maintenance_story",
      label: "Maintenance story ready",
      status: statusById(readiness.checks, "demo_story"),
      detail:
        "The walkthrough includes one upcoming visit, one active visit, and one completed visit.",
    },
    {
      id: "customer_updates",
      label: "Customer updates ready",
      status: statusById(readiness.checks, "notification_evidence"),
      detail:
        "The inbox and reporting screens have customer update activity to show.",
    },
    {
      id: "automatic_email_safety",
      label: "Automatic emails are safe",
      status: statusById(readiness.checks, "scheduler_live_guard"),
      detail:
        readiness.scheduler.mode === "live"
          ? "Automatic live emails are turned on. Turn them off before the walkthrough."
          : "No automatic live emails will be sent during the walkthrough.",
    },
    {
      id: "medcore_scope",
      label: "Limited to this account",
      status: statusById(readiness.checks, "scheduler_rollout_scope"),
      detail:
        "Automated reminder settings are limited to this MedCore walkthrough.",
    },
    {
      id: "clean_records",
      label: "Clean records",
      status: statusById(readiness.checks, "legacy_smoke_data"),
      detail: "Old test records are not visible in the walkthrough screens.",
    },
    {
      id: "system_health",
      label: "System health",
      status: statusById(readiness.checks, "migration_state"),
      detail: "The production database is reachable and healthy.",
    },
    {
      id: "email_service",
      label: "Email service",
      status: statusById(readiness.checks, "email_provider"),
      detail: "Email sending is configured for supervised use.",
    },
    {
      id: "sign_in_setup",
      label: "Sign-in setup",
      status: statusById(readiness.checks, "clerk_keys"),
      detail:
        "The current sign-in setup is accepted for this walkthrough.",
    },
  ] satisfies Array<{
    id: string;
    label: string;
    status: DisplayStatus;
    detail: string;
  }>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Walkthrough Health"
        description="A simple readiness view for the MedCore maintenance walkthrough."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/manufacturer/preventive-maintenance">
                <ClipboardCheck data-icon="inline-start" />
                Maintenance
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/notifications">
                <Mail data-icon="inline-start" />
                Inbox
              </Link>
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-indigo-600" />
                  Walkthrough Status
                </CardTitle>
                <CardDescription>
                  Checked {new Date(readiness.generatedAt).toLocaleString()}
                </CardDescription>
              </div>
              <StatusBadge status={readiness.overallStatus} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile
              label="Customer account"
              value={readiness.organization.currentName ?? "Not found"}
              detail="Workspace selected for this walkthrough"
            />
            <MetricTile
              label="Maintenance visits"
              value={readiness.demoSeed.counts.events.toLocaleString()}
              detail="Prepared visits available to present"
            />
            <MetricTile
              label="Customer updates"
              value={readiness.demoSeed.counts.notifications.toLocaleString()}
              detail="Inbox and report items ready"
            />
            <MetricTile
              label="Automatic emails"
              value={automaticReminderLabel(readiness.scheduler.mode)}
              detail="Live sending stays closed for the walkthrough"
            />
            <MetricTile
              label="Email service"
              value={
                readiness.deliveryReadiness.liveEmail.status === "ready"
                  ? "Ready"
                  : "Needs attention"
              }
              detail="Available only when intentionally used"
            />
            <MetricTile
              label="Data quality"
              value={readiness.smokeData.total === 0 ? "Clean" : "Review"}
              detail="Old test records are hidden from the story"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Before The Call</CardTitle>
            <CardDescription>
              Quick confirmation for the person running the walkthrough.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>Use MedCore as the customer account.</p>
            <p>Start with the Dashboard, then open Maintenance, Inbox, and Reporting.</p>
            <p>Keep automatic live emails closed unless everyone has agreed to a supervised send.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Readiness Checks</CardTitle>
            <CardDescription>
              Anything marked not ready should be fixed before the walkthrough.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {businessChecks.map((check) => {
              const Icon =
                check.status === "pass" ? CheckCircle2 : AlertTriangle;

              return (
                <div
                  key={check.id}
                  className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <Icon
                    className={
                      check.status === "pass"
                        ? "mt-0.5 size-4 shrink-0 text-emerald-600"
                        : check.status === "warn"
                          ? "mt-0.5 size-4 shrink-0 text-amber-600"
                          : "mt-0.5 size-4 shrink-0 text-rose-600"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">
                        {check.label}
                      </p>
                      <StatusBadge status={check.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {check.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Walkthrough Records</CardTitle>
              <CardDescription>
                The prepared records that support the maintenance story.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Product models"
                value={readiness.demoSeed.counts.productModels.toLocaleString()}
                detail="Products available in the story"
              />
              <MetricTile
                label="Installed units"
                value={readiness.demoSeed.counts.assets.toLocaleString()}
                detail="Customer equipment records"
              />
              <MetricTile
                label="Maintenance plans"
                value={readiness.demoSeed.counts.plans.toLocaleString()}
                detail="Planned service programs"
              />
              <MetricTile
                label="Service partner"
                value={
                  readiness.demoSeed.counts.serviceOrganizations > 0
                    ? "Ready"
                    : "Missing"
                }
                detail="Partner assigned to the visits"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Maintenance Story</CardTitle>
              <CardDescription>
                The three records to open during the walkthrough.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {readiness.demoSeed.storyEvents.map((event) => (
                <div
                  key={event.eventNumber}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-950">
                      {event.eventNumber}
                    </p>
                    <p className="text-xs text-slate-500">
                      {event.status === "scheduled"
                        ? "Upcoming visit"
                        : event.status === "in_progress"
                          ? "Work in progress"
                          : "Completed visit"}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {event.status === "in_progress"
                      ? "In progress"
                      : event.status === "scheduled"
                        ? "Upcoming"
                        : "Completed"}
                  </Badge>
                </div>
              ))}
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/notifications/reporting">
                  Reporting
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

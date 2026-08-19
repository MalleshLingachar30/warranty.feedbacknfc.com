import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Mail,
  RefreshCw,
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
import {
  getPreventiveMaintenanceDemoReadiness,
  MEDCORE_PM_DEMO_ORG_ID,
} from "@/lib/preventive-maintenance-demo-readiness";

const statusStyles = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  fail: "border-rose-200 bg-rose-50 text-rose-700",
} as const;

const statusLabels = {
  pass: "Ready",
  warn: "Attention",
  fail: "Blocked",
} as const;

function StatusBadge({ status }: { status: "pass" | "warn" | "fail" }) {
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

export default async function ManufacturerDemoOpsPage() {
  const context = await resolveManufacturerPageContext();
  const readiness = await getPreventiveMaintenanceDemoReadiness({
    organizationId: context.organizationId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demo Ops"
        description="MedCore preventive-maintenance demo readiness, safety posture, and operator runbook."
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

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-indigo-600" />
                  Demo Readiness
                </CardTitle>
                <CardDescription>
                  Generated {new Date(readiness.generatedAt).toLocaleString()}
                </CardDescription>
              </div>
              <StatusBadge status={readiness.overallStatus} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile
              label="Workspace"
              value={readiness.organization.currentName ?? "Missing"}
              detail={readiness.organization.currentId ?? "No organization"}
            />
            <MetricTile
              label="PM Events"
              value={readiness.demoSeed.counts.events.toLocaleString()}
              detail="Demo-tagged preventive-maintenance events"
            />
            <MetricTile
              label="Notifications"
              value={readiness.demoSeed.counts.notifications.toLocaleString()}
              detail={`${readiness.demoSeed.counts.deliveryAttempts.toLocaleString()} delivery attempts`}
            />
            <MetricTile
              label="Scheduler"
              value={readiness.scheduler.mode.replace("_", " ")}
              detail={`Batch cap ${readiness.scheduler.batchLimit}; ${readiness.scheduler.organizationScope.organizationCount} allowed org`}
            />
            <MetricTile
              label="Live Email"
              value={readiness.deliveryReadiness.liveEmail.status}
              detail="Resend provider configuration"
            />
            <MetricTile
              label="Smoke Data"
              value={readiness.smokeData.total.toLocaleString()}
              detail="Legacy PM smoke record groups"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="size-5 text-indigo-600" />
              Reset Command
            </CardTitle>
            <CardDescription>
              Guarded CLI path for production demo data reset.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
              <code className="break-words">{readiness.demoSeed.resetCommand}</code>
            </div>
            <p className="text-sm text-slate-600">
              Reset deletes only Phase 5H demo-tagged rows and separately
              confirmed legacy smoke rows. It is intentionally outside the
              browser until the seed module is shared with an audited server
              action.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pre-Demo Checks</CardTitle>
            <CardDescription>
              All blocking checks must be ready before a client session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {readiness.checks.map((check) => {
              const Icon =
                check.status === "pass"
                  ? CheckCircle2
                  : check.status === "warn"
                    ? AlertTriangle
                    : AlertTriangle;

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
              <CardTitle className="flex items-center gap-2">
                <Database className="size-5 text-indigo-600" />
                Demo Seed Inventory
              </CardTitle>
              <CardDescription>
                Demo marker: {readiness.demoSeed.key}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {Object.entries(readiness.demoSeed.counts).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                >
                  <span className="text-sm capitalize text-slate-600">
                    {label.replace(/([A-Z])/g, " $1")}
                  </span>
                  <span className="text-sm font-semibold text-slate-950">
                    {value.toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Story Events</CardTitle>
              <CardDescription>
                Expected demo tenant: {MEDCORE_PM_DEMO_ORG_ID}
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
                      {event.triggerCount} notification triggers
                    </p>
                  </div>
                  <Badge variant="secondary">{event.status}</Badge>
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

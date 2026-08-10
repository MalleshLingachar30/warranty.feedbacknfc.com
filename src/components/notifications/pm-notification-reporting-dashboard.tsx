import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  Clock3,
  Download,
  FileCheck2,
  Inbox,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SerializedPmNotificationReporting } from "@/lib/preventive-maintenance-notification-reporting";
import { serializePmNotificationReportingFilters } from "@/lib/preventive-maintenance-notification-reporting-policy";

type PmNotificationReportingDashboardProps = {
  reporting: SerializedPmNotificationReporting;
  filterError?: string | null;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function labelFromSnakeCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null) {
  return value ? DATE_TIME_FORMATTER.format(new Date(value)) : "Not available";
}

function formatDuration(minutes: number | null) {
  if (minutes === null) {
    return "—";
  }

  if (minutes < 60) {
    return `${minutes.toLocaleString("en-IN")} min`;
  }

  if (minutes < 1_440) {
    return `${(minutes / 60).toLocaleString("en-IN", { maximumFractionDigits: 1 })} hr`;
  }

  return `${(minutes / 1_440).toLocaleString("en-IN", { maximumFractionDigits: 1 })} d`;
}

function statusBadgeVariant(status: string) {
  if (status === "failed" || status === "dead_letter") {
    return "destructive" as const;
  }

  if (status === "sent" || status === "succeeded") {
    return "default" as const;
  }

  if (status === "skipped" || status === "completed_with_failures") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function MetricCard(props: { label: string; value: number; detail: string }) {
  return (
    <Card className="gap-4 py-4">
      <CardHeader>
        <CardDescription>{props.label}</CardDescription>
        <CardTitle className="font-mono text-2xl tabular-nums">
          {props.value.toLocaleString("en-IN")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{props.detail}</p>
      </CardContent>
    </Card>
  );
}

function DurationCard(props: {
  title: string;
  description: string;
  summary: SerializedPmNotificationReporting["responsiveness"]["dismissal"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {props.summary.sampleCount === 0 ? (
          <Empty className="border py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3 />
              </EmptyMedia>
              <EmptyTitle>No observed response yet</EmptyTitle>
              <EmptyDescription>
                The selected range has no safely derivable completed response.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <dl className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Average</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">
                {formatDuration(props.summary.averageMinutes)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Median</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">
                {formatDuration(props.summary.medianMinutes)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">P90</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">
                {formatDuration(props.summary.p90Minutes)}
              </dd>
            </div>
            <div className="col-span-3 text-xs text-muted-foreground">
              {props.summary.sampleCount.toLocaleString("en-IN")} observation
              {props.summary.sampleCount === 1 ? "" : "s"}
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

export function PmNotificationReportingDashboard({
  reporting,
  filterError,
}: PmNotificationReportingDashboardProps) {
  const exportQuery = serializePmNotificationReportingFilters({
    ...reporting.filters,
    startAt: new Date(`${reporting.filters.startDate}T00:00:00.000Z`),
    endAtExclusive: new Date(
      new Date(`${reporting.filters.endDate}T00:00:00.000Z`).getTime() +
        24 * 60 * 60 * 1_000,
    ),
  });
  const funnel = reporting.funnel;
  const latestRun = reporting.scheduler.latestRun;
  const schedulerCounters = reporting.scheduler.counters;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 break-words">
      <PageHeader
        title="PM notification reporting"
        description="Validate delivery, manual live pilot, suppression, scheduler health, and response outcomes from canonical PM notification records."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/notifications">
                <ArrowLeft data-icon="inline-start" />
                Inbox
              </Link>
            </Button>
            <Button asChild size="sm">
              <a
                href={`/api/preventive-maintenance/notifications/report?${exportQuery}`}
              >
                <Download data-icon="inline-start" />
                Export CSV
              </a>
            </Button>
          </>
        }
      />

      <Card className="gap-4 py-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck />
            Privacy-safe operational scope
          </CardTitle>
          <CardDescription>
            {reporting.scope.organizationScoped
              ? "Results are restricted to the signed-in operator’s PM notification audience."
              : "Platform owner results cover the system-wide PM notification audience."}{" "}
            Raw email addresses and phone numbers are omitted from this UI, the
            analytics API, and CSV exports.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange />
            Report controls
          </CardTitle>
          <CardDescription>
            Date range applies to notification creation time. Channel applies to
            delivery attempts; notification counts remain visible for the range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/dashboard/notifications/reporting" method="get">
            <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field>
                <FieldLabel htmlFor="pm-report-start-date">
                  Start date
                </FieldLabel>
                <Input
                  id="pm-report-start-date"
                  name="startDate"
                  type="date"
                  defaultValue={reporting.filters.startDate}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pm-report-end-date">End date</FieldLabel>
                <Input
                  id="pm-report-end-date"
                  name="endDate"
                  type="date"
                  defaultValue={reporting.filters.endDate}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pm-report-status">
                  Intent status
                </FieldLabel>
                <Select name="status" defaultValue={reporting.filters.status}>
                  <SelectTrigger id="pm-report-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="pm-report-channel">
                  Attempt channel
                </FieldLabel>
                <Select name="channel" defaultValue={reporting.filters.channel}>
                  <SelectTrigger id="pm-report-channel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Email and SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="justify-end">
                <FieldLabel className="sr-only">
                  Apply report filters
                </FieldLabel>
                <Button type="submit">
                  <RefreshCw data-icon="inline-start" />
                  Apply filters
                </Button>
              </Field>
              {filterError ? (
                <FieldError className="md:col-span-2 xl:col-span-5">
                  {filterError} The default 30-day range is shown instead.
                </FieldError>
              ) : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="delivery-funnel-title"
      >
        <div className="flex flex-col gap-1">
          <h2 id="delivery-funnel-title" className="text-lg font-semibold">
            Delivery funnel
          </h2>
          <p className="text-sm text-muted-foreground">
            {reporting.filters.startDate} through {reporting.filters.endDate} ·{" "}
            {funnel.totalNotifications.toLocaleString("en-IN")} intents ·{" "}
            {funnel.totalAttempts.toLocaleString("en-IN")} attempts
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Pending intents"
            value={funnel.notificationStatusCounts.pending}
            detail="Awaiting inbox action"
          />
          <MetricCard
            label="Queued attempts"
            value={funnel.attemptStatusCounts.queued}
            detail="Ready for dispatch"
          />
          <MetricCard
            label="Skipped attempts"
            value={funnel.attemptStatusCounts.skipped}
            detail={`${funnel.preferenceSuppressedCount.toLocaleString("en-IN")} preference · ${funnel.missingRecipientCount.toLocaleString("en-IN")} missing recipient`}
          />
          <MetricCard
            label="Failed attempts"
            value={funnel.attemptStatusCounts.failed}
            detail="Eligible for retry policy"
          />
          <MetricCard
            label="Sent attempts"
            value={funnel.attemptStatusCounts.sent}
            detail="Provider accepted"
          />
          <MetricCard
            label="Dead letter"
            value={funnel.attemptStatusCounts.dead_letter}
            detail="Retry limit reached"
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity />
              Scheduler health
            </CardTitle>
            <CardDescription>
              {reporting.scheduler.scope === "system"
                ? "System-wide scheduled dispatcher counters."
                : "Latest scheduled run containing attempts visible to this operator."}
            </CardDescription>
            <CardAction>
              <Badge
                variant={
                  latestRun ? statusBadgeVariant(latestRun.status) : "outline"
                }
              >
                {latestRun ? labelFromSnakeCase(latestRun.status) : "No run"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">Latest run</dt>
                <dd className="text-sm font-medium">
                  {formatDateTime(latestRun?.startedAt ?? null)}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">
                  Last successful run
                </dt>
                <dd className="text-sm font-medium">
                  {formatDateTime(
                    reporting.scheduler.lastSuccessfulRun?.completedAt ?? null,
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">Mode</dt>
                <dd className="text-sm font-medium">
                  {labelFromSnakeCase(reporting.scheduler.configuration.mode)} ·{" "}
                  {reporting.scheduler.configuration.enabled
                    ? "enabled"
                    : "disabled"}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">Cadence</dt>
                <dd className="text-sm font-medium">
                  {reporting.scheduler.configuration.schedule}
                </dd>
              </div>
            </dl>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-4">
              {[
                ["Scanned", schedulerCounters.scannedIntentCount],
                ["Candidates", schedulerCounters.candidateAttemptCount],
                ["Created", schedulerCounters.createdAttemptCount],
                ["Existing", schedulerCounters.existingAttemptCount],
                ["Skipped", schedulerCounters.skippedAttemptCount],
                ["Suppressed", schedulerCounters.preferenceSuppressedCount],
                ["Retried", schedulerCounters.retriedAttemptCount],
                ["Dead letter", schedulerCounters.deadLetteredAttemptCount],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums">
                    {Number(value).toLocaleString("en-IN")}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Channel outcome matrix</CardTitle>
            <CardDescription>
              Attempt counts by channel for the selected notification range.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Queued</TableHead>
                  <TableHead className="text-right">Sending</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Dead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(["email", "sms"] as const).map((channel) => {
                  const counts = funnel.channelStatusCounts[channel];
                  return (
                    <TableRow key={channel}>
                      <TableCell className="font-medium">
                        {labelFromSnakeCase(channel)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {counts.queued.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {counts.sending.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {counts.skipped.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {counts.failed.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {counts.sent.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {counts.dead_letter.toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 border-rose-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailCheck />
            Manual live email pilot audit
          </CardTitle>
          <CardDescription>
            Counts come directly from role-gated manual pilot audit records for
            this date range. Recipient addresses and provider payloads are not
            included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
            {[
              ["Batches", reporting.manualPilot.batchCount],
              ["Succeeded", reporting.manualPilot.outcomeCounts.succeeded],
              [
                "With failures",
                reporting.manualPilot.outcomeCounts.completed_with_failures,
              ],
              ["Rejected", reporting.manualPilot.outcomeCounts.rejected],
              ["Failed", reporting.manualPilot.outcomeCounts.failed],
              ["Attempts", reporting.manualPilot.deliveryAttemptCount],
              ["Provider calls", reporting.manualPilot.providerCallCount],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">
                  {Number(value).toLocaleString("en-IN")}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="response-title">
        <div className="flex flex-col gap-1">
          <h2 id="response-title" className="text-lg font-semibold">
            PM notification responsiveness
          </h2>
          <p className="text-sm text-muted-foreground">
            Durations are derived only when canonical timestamps establish an
            observable outcome after notification creation.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <DurationCard
            title="Creation to dismissal"
            description="Notification createdAt to dismissed status updatedAt."
            summary={reporting.responsiveness.dismissal}
          />
          <DurationCard
            title="Creation to next PM status change"
            description="Notification createdAt to the next scheduled, started, completed, or cancelled timeline entry."
            summary={reporting.responsiveness.pmStatusChange}
          />
        </div>
      </section>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 />
            Recent delivery outcomes
          </CardTitle>
          <CardDescription>
            Latest 25 attempts in scope. Recipient addresses and provider
            payloads are intentionally excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reporting.recentAttempts.length === 0 ? (
            <Empty className="border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No delivery attempts in this range</EmptyTitle>
                <EmptyDescription>
                  Pending notification intents remain visible in the funnel.
                  Adjust the date, status, or channel filters to inspect other
                  outcomes.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Updated</TableHead>
                  <TableHead>PM event</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Diagnostic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reporting.recentAttempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell>{formatDateTime(attempt.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs font-medium">
                          {attempt.eventNumber}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {labelFromSnakeCase(attempt.triggerType)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {labelFromSnakeCase(attempt.recipientRole)}
                    </TableCell>
                    <TableCell>{labelFromSnakeCase(attempt.channel)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(attempt.status)}>
                        {labelFromSnakeCase(attempt.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {attempt.dryRun
                        ? "Dry run"
                        : attempt.dispatchSource === "manual_pilot"
                          ? "Manual pilot"
                          : attempt.dispatchSource === "scheduled"
                            ? "Scheduled live"
                            : "Live"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {attempt.attemptNumber}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                      {attempt.skipReason
                        ? labelFromSnakeCase(attempt.skipReason)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

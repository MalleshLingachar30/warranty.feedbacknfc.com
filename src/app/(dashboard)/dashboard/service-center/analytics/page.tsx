import { Prisma } from "@prisma/client";
import {
  ChartColumn,
  Clock3,
  ShieldAlert,
  Star,
  TicketCheck,
  TimerReset,
  Truck,
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";

import {
  decimalToNumber,
  resolveServiceCenterPageContext,
} from "../../_lib/service-center-context";

type ServiceCenterAnalyticsSummaryRow = {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  pendingConfirmationCount: number;
  slaBreachedCount: number;
  avgAssignmentLatencyHours: number | null;
  avgResolutionHours: number | null;
  avgCustomerServiceRating: number | null;
  ratedJobsCount: number;
};

type MonthlyThroughputRow = {
  monthStart: Date;
  tickets: number;
  resolved: number;
  avgResolutionHours: number | null;
};

type IssueConcentrationRow = {
  issue: string;
  count: number;
};

type RegionalLoadRow = {
  city: string | null;
  tickets: number;
  resolved: number;
  avgResolutionHours: number | null;
};

type TechnicianAnalyticsRow = {
  technicianId: string;
  name: string;
  tickets: number;
  resolved: number;
  avgResolutionHours: number | null;
  avgCustomerServiceRating: number | null;
  ratedJobsCount: number;
  pendingReturns: number;
  unusedSpareObligations: number;
};

type ManufacturerAnalyticsRow = {
  manufacturerId: string;
  manufacturerName: string;
  tickets: number;
  resolved: number;
  pendingConfirmation: number;
  avgResolutionHours: number | null;
  pendingReturns: number;
  unusedSpareObligations: number;
};

function toNumber(value: unknown) {
  return decimalToNumber(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number | null | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${numeric.toFixed(1)}h`;
}

function formatScore(value: number | null | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${numeric.toFixed(1)}/5`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function returnStatusTone(status: string) {
  switch (status) {
    case "awaiting_collection":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "collected_by_technician":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "received_at_service_center":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "received_by_manufacturer":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "closed":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function spareStatusTone(status: string) {
  switch (status) {
    case "received_by_technician":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "partially_reconciled":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "returned_unused":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function buildMonthBuckets(months: number) {
  const now = new Date();
  const output: Array<{ key: string; label: string }> = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    output.push({
      key: monthKey(current),
      label: monthLabel(current),
    });
  }

  return output;
}

export default async function ServiceCenterAnalyticsPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    summaryRow,
    monthlyRows,
    issueRows,
    regionalRows,
    technicianRows,
    manufacturerRows,
    returnStatusRows,
    spareStatusRows,
  ] = await Promise.all([
    db.$queryRaw<ServiceCenterAnalyticsSummaryRow[]>(Prisma.sql`
      WITH scoped_tickets AS (
        SELECT
          t.status,
          t.sla_breached,
          t.reported_at,
          t.assigned_at,
          t.technician_started_at,
          t.technician_completed_at,
          t.customer_service_rating
        FROM tickets t
        LEFT JOIN service_centers assigned_sc
          ON assigned_sc.id = t.assigned_service_center_id
        LEFT JOIN technicians tech
          ON tech.id = t.assigned_technician_id
        LEFT JOIN service_centers tech_sc
          ON tech_sc.id = tech.service_center_id
        WHERE assigned_sc.organization_id = ${organizationId}::uuid
           OR tech_sc.organization_id = ${organizationId}::uuid
      )
      SELECT
        COUNT(*)::int AS "totalTickets",
        COUNT(*) FILTER (
          WHERE status IN (
            'reported',
            'awaiting_technician_acceptance',
            'assigned',
            'technician_enroute',
            'work_in_progress',
            'pending_confirmation',
            'reopened',
            'escalated'
          )
        )::int AS "openTickets",
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS "resolvedTickets",
        COUNT(*) FILTER (WHERE status = 'pending_confirmation')::int AS "pendingConfirmationCount",
        COUNT(*) FILTER (WHERE sla_breached)::int AS "slaBreachedCount",
        AVG(
          CASE
            WHEN assigned_at IS NOT NULL AND assigned_at >= reported_at
            THEN EXTRACT(EPOCH FROM (assigned_at - reported_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgAssignmentLatencyHours",
        AVG(
          CASE
            WHEN technician_started_at IS NOT NULL
              AND technician_completed_at IS NOT NULL
              AND technician_completed_at >= technician_started_at
            THEN EXTRACT(EPOCH FROM (technician_completed_at - technician_started_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgResolutionHours",
        AVG(customer_service_rating)::double precision AS "avgCustomerServiceRating",
        COUNT(*) FILTER (WHERE customer_service_rating IS NOT NULL)::int AS "ratedJobsCount"
      FROM scoped_tickets
    `),
    db.$queryRaw<MonthlyThroughputRow[]>(Prisma.sql`
      SELECT
        DATE_TRUNC('month', t.reported_at)::date AS "monthStart",
        COUNT(*)::int AS tickets,
        COUNT(*) FILTER (WHERE t.status IN ('resolved', 'closed'))::int AS resolved,
        AVG(
          CASE
            WHEN t.technician_started_at IS NOT NULL
              AND t.technician_completed_at IS NOT NULL
              AND t.technician_completed_at >= t.technician_started_at
            THEN EXTRACT(EPOCH FROM (t.technician_completed_at - t.technician_started_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgResolutionHours"
      FROM tickets t
      LEFT JOIN service_centers assigned_sc
        ON assigned_sc.id = t.assigned_service_center_id
      LEFT JOIN technicians tech
        ON tech.id = t.assigned_technician_id
      LEFT JOIN service_centers tech_sc
        ON tech_sc.id = tech.service_center_id
      WHERE (
        assigned_sc.organization_id = ${organizationId}::uuid
        OR tech_sc.organization_id = ${organizationId}::uuid
      )
        AND t.reported_at >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', t.reported_at)::date
      ORDER BY DATE_TRUNC('month', t.reported_at)::date ASC
    `),
    db.$queryRaw<IssueConcentrationRow[]>(Prisma.sql`
      SELECT
        COALESCE(NULLIF(BTRIM(t.issue_category), ''), 'General issue') AS issue,
        COUNT(*)::int AS count
      FROM tickets t
      LEFT JOIN service_centers assigned_sc
        ON assigned_sc.id = t.assigned_service_center_id
      LEFT JOIN technicians tech
        ON tech.id = t.assigned_technician_id
      LEFT JOIN service_centers tech_sc
        ON tech_sc.id = tech.service_center_id
      WHERE assigned_sc.organization_id = ${organizationId}::uuid
         OR tech_sc.organization_id = ${organizationId}::uuid
      GROUP BY COALESCE(NULLIF(BTRIM(t.issue_category), ''), 'General issue')
      ORDER BY COUNT(*) DESC, issue ASC
      LIMIT 10
    `),
    db.$queryRaw<RegionalLoadRow[]>(Prisma.sql`
      SELECT
        COALESCE(p.customer_city, 'Unknown') AS city,
        COUNT(*)::int AS tickets,
        COUNT(*) FILTER (WHERE t.status IN ('resolved', 'closed'))::int AS resolved,
        AVG(
          CASE
            WHEN t.technician_started_at IS NOT NULL
              AND t.technician_completed_at IS NOT NULL
              AND t.technician_completed_at >= t.technician_started_at
            THEN EXTRACT(EPOCH FROM (t.technician_completed_at - t.technician_started_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgResolutionHours"
      FROM tickets t
      INNER JOIN products p ON p.id = t.product_id
      LEFT JOIN service_centers assigned_sc
        ON assigned_sc.id = t.assigned_service_center_id
      LEFT JOIN technicians tech
        ON tech.id = t.assigned_technician_id
      LEFT JOIN service_centers tech_sc
        ON tech_sc.id = tech.service_center_id
      WHERE assigned_sc.organization_id = ${organizationId}::uuid
         OR tech_sc.organization_id = ${organizationId}::uuid
      GROUP BY COALESCE(p.customer_city, 'Unknown')
      ORDER BY COUNT(*) DESC, city ASC
      LIMIT 12
    `),
    db.$queryRaw<TechnicianAnalyticsRow[]>(Prisma.sql`
      SELECT
        tech.id AS "technicianId",
        tech.name AS name,
        COUNT(t.id)::int AS tickets,
        COUNT(*) FILTER (WHERE t.status IN ('resolved', 'closed'))::int AS resolved,
        AVG(
          CASE
            WHEN t.technician_started_at IS NOT NULL
              AND t.technician_completed_at IS NOT NULL
              AND t.technician_completed_at >= t.technician_started_at
            THEN EXTRACT(EPOCH FROM (t.technician_completed_at - t.technician_started_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgResolutionHours",
        AVG(t.customer_service_rating)::double precision AS "avgCustomerServiceRating",
        COUNT(*) FILTER (WHERE t.customer_service_rating IS NOT NULL)::int AS "ratedJobsCount",
        COALESCE(return_obligations.pending_returns, 0)::int AS "pendingReturns",
        COALESCE(spare_obligations.unused_spare_obligations, 0)::int AS "unusedSpareObligations"
      FROM technicians tech
      INNER JOIN service_centers sc
        ON sc.id = tech.service_center_id
      LEFT JOIN tickets t
        ON t.assigned_technician_id = tech.id
      LEFT JOIN (
        SELECT
          ret.technician_id AS technician_id,
          COUNT(*)::int AS pending_returns
        FROM ticket_part_returns ret
        INNER JOIN service_centers ret_sc
          ON ret_sc.id = ret.service_center_id
        WHERE ret_sc.organization_id = ${organizationId}::uuid
          AND ret.technician_id IS NOT NULL
          AND ret.status IN ('awaiting_collection', 'collected_by_technician', 'received_at_service_center')
        GROUP BY ret.technician_id
      ) return_obligations
        ON return_obligations.technician_id = tech.id
      LEFT JOIN (
        SELECT
          dispatch.assigned_technician_id AS technician_id,
          COUNT(item.id)::int AS unused_spare_obligations
        FROM ticket_part_dispatch_items item
        INNER JOIN ticket_part_dispatches dispatch
          ON dispatch.id = item.dispatch_id
        INNER JOIN service_centers dispatch_sc
          ON dispatch_sc.id = dispatch.service_center_id
        INNER JOIN tickets dispatch_ticket
          ON dispatch_ticket.id = dispatch.ticket_id
        WHERE dispatch_sc.organization_id = ${organizationId}::uuid
          AND dispatch.assigned_technician_id IS NOT NULL
          AND dispatch_ticket.technician_completed_at IS NOT NULL
          AND item.status IN ('received_by_technician', 'partially_reconciled')
        GROUP BY dispatch.assigned_technician_id
      ) spare_obligations
        ON spare_obligations.technician_id = tech.id
      WHERE sc.organization_id = ${organizationId}::uuid
      GROUP BY
        tech.id,
        tech.name,
        return_obligations.pending_returns,
        spare_obligations.unused_spare_obligations
      ORDER BY COUNT(t.id) DESC, tech.name ASC
    `),
    db.$queryRaw<ManufacturerAnalyticsRow[]>(Prisma.sql`
      SELECT
        manufacturer.id AS "manufacturerId",
        manufacturer.name AS "manufacturerName",
        COUNT(t.id)::int AS tickets,
        COUNT(*) FILTER (WHERE t.status IN ('resolved', 'closed'))::int AS resolved,
        COUNT(*) FILTER (WHERE t.status = 'pending_confirmation')::int AS "pendingConfirmation",
        AVG(
          CASE
            WHEN t.technician_started_at IS NOT NULL
              AND t.technician_completed_at IS NOT NULL
              AND t.technician_completed_at >= t.technician_started_at
            THEN EXTRACT(EPOCH FROM (t.technician_completed_at - t.technician_started_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgResolutionHours",
        COALESCE(return_obligations.pending_returns, 0)::int AS "pendingReturns",
        COALESCE(spare_obligations.unused_spare_obligations, 0)::int AS "unusedSpareObligations"
      FROM tickets t
      INNER JOIN products p
        ON p.id = t.product_id
      INNER JOIN organizations manufacturer
        ON manufacturer.id = p.organization_id
      LEFT JOIN service_centers assigned_sc
        ON assigned_sc.id = t.assigned_service_center_id
      LEFT JOIN technicians tech
        ON tech.id = t.assigned_technician_id
      LEFT JOIN service_centers tech_sc
        ON tech_sc.id = tech.service_center_id
      LEFT JOIN (
        SELECT
          p.organization_id AS manufacturer_id,
          COUNT(*)::int AS pending_returns
        FROM ticket_part_returns ret
        INNER JOIN tickets ticket
          ON ticket.id = ret.ticket_id
        INNER JOIN products p
          ON p.id = ticket.product_id
        INNER JOIN service_centers ret_sc
          ON ret_sc.id = ret.service_center_id
        WHERE ret_sc.organization_id = ${organizationId}::uuid
          AND ret.status IN ('awaiting_collection', 'collected_by_technician', 'received_at_service_center')
        GROUP BY p.organization_id
      ) return_obligations
        ON return_obligations.manufacturer_id = manufacturer.id
      LEFT JOIN (
        SELECT
          p.organization_id AS manufacturer_id,
          COUNT(item.id)::int AS unused_spare_obligations
        FROM ticket_part_dispatch_items item
        INNER JOIN ticket_part_dispatches dispatch
          ON dispatch.id = item.dispatch_id
        INNER JOIN service_centers dispatch_sc
          ON dispatch_sc.id = dispatch.service_center_id
        INNER JOIN tickets dispatch_ticket
          ON dispatch_ticket.id = dispatch.ticket_id
        INNER JOIN products p
          ON p.id = dispatch_ticket.product_id
        WHERE dispatch_sc.organization_id = ${organizationId}::uuid
          AND dispatch_ticket.technician_completed_at IS NOT NULL
          AND item.status IN ('received_by_technician', 'partially_reconciled')
        GROUP BY p.organization_id
      ) spare_obligations
        ON spare_obligations.manufacturer_id = manufacturer.id
      WHERE assigned_sc.organization_id = ${organizationId}::uuid
         OR tech_sc.organization_id = ${organizationId}::uuid
      GROUP BY
        manufacturer.id,
        manufacturer.name,
        return_obligations.pending_returns,
        spare_obligations.unused_spare_obligations
      ORDER BY COUNT(t.id) DESC, manufacturer.name ASC
    `),
    db.ticketPartReturn.groupBy({
      by: ["status"],
      where: {
        serviceCenter: {
          organizationId,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        status: "asc",
      },
    }),
    db.ticketPartDispatchItem.groupBy({
      by: ["status"],
      where: {
        dispatch: {
          serviceCenter: {
            organizationId,
          },
          ticket: {
            technicianCompletedAt: {
              not: null,
            },
          },
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        status: "asc",
      },
    }),
  ]);

  const totalTickets = toNumber(summaryRow[0]?.totalTickets);
  const openTickets = toNumber(summaryRow[0]?.openTickets);
  const resolvedTickets = toNumber(summaryRow[0]?.resolvedTickets);
  const pendingConfirmationCount = toNumber(
    summaryRow[0]?.pendingConfirmationCount,
  );
  const slaBreachedCount = toNumber(summaryRow[0]?.slaBreachedCount);
  const avgAssignmentLatencyHours = toNumber(
    summaryRow[0]?.avgAssignmentLatencyHours,
  );
  const avgResolutionHours = toNumber(summaryRow[0]?.avgResolutionHours);
  const avgCustomerServiceRating = toNumber(
    summaryRow[0]?.avgCustomerServiceRating,
  );
  const ratedJobsCount = toNumber(summaryRow[0]?.ratedJobsCount);

  const slaBreachRate =
    totalTickets > 0 ? (slaBreachedCount / totalTickets) * 100 : 0;
  const resolutionRate =
    totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;

  const monthBuckets = buildMonthBuckets(6);
  const monthlyMap = new Map(
    monthlyRows.map((row) => [monthKey(new Date(row.monthStart)), row]),
  );
  const monthlyThroughput = monthBuckets.map((bucket) => {
    const row = monthlyMap.get(bucket.key);

    return {
      label: bucket.label,
      tickets: toNumber(row?.tickets),
      resolved: toNumber(row?.resolved),
      avgResolutionHours: toNumber(row?.avgResolutionHours),
    };
  });

  const issueConcentration = issueRows.map((row) => ({
    issue: row.issue,
    count: toNumber(row.count),
  }));

  const regionalLoad = regionalRows.map((row) => {
    const tickets = toNumber(row.tickets);
    const resolved = toNumber(row.resolved);

    return {
      city: row.city ?? "Unknown",
      tickets,
      resolved,
      resolutionRate: tickets > 0 ? (resolved / tickets) * 100 : 0,
      avgResolutionHours: toNumber(row.avgResolutionHours),
    };
  });

  const technicianAnalytics = technicianRows.map((row) => {
    const tickets = toNumber(row.tickets);
    const resolved = toNumber(row.resolved);

    return {
      technicianId: row.technicianId,
      name: row.name,
      tickets,
      resolved,
      resolutionRate: tickets > 0 ? (resolved / tickets) * 100 : 0,
      avgResolutionHours: toNumber(row.avgResolutionHours),
      avgCustomerServiceRating: toNumber(row.avgCustomerServiceRating),
      ratedJobsCount: toNumber(row.ratedJobsCount),
      pendingReturns: toNumber(row.pendingReturns),
      unusedSpareObligations: toNumber(row.unusedSpareObligations),
    };
  });

  const manufacturerAnalytics = manufacturerRows.map((row) => {
    const tickets = toNumber(row.tickets);
    const resolved = toNumber(row.resolved);

    return {
      manufacturerId: row.manufacturerId,
      manufacturerName: row.manufacturerName,
      tickets,
      resolved,
      resolutionRate: tickets > 0 ? (resolved / tickets) * 100 : 0,
      pendingConfirmation: toNumber(row.pendingConfirmation),
      avgResolutionHours: toNumber(row.avgResolutionHours),
      pendingReturns: toNumber(row.pendingReturns),
      unusedSpareObligations: toNumber(row.unusedSpareObligations),
    };
  });

  const returnStatusBreakdown = returnStatusRows.map((row) => ({
    status: row.status,
    count: row._count._all,
  }));
  const spareStatusBreakdown = spareStatusRows.map((row) => ({
    status: row.status,
    count: row._count._all,
  }));

  const pendingReturnObligations = returnStatusBreakdown
    .filter((row) =>
      ["awaiting_collection", "collected_by_technician", "received_at_service_center"].includes(
        row.status,
      ),
    )
    .reduce((sum, row) => sum + row.count, 0);

  const unusedSpareObligations = spareStatusBreakdown
    .filter((row) => ["received_by_technician", "partially_reconciled"].includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Center Analytics"
        description="Throughput, SLA, technician performance, return compliance, and manufacturer workload trends."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Tickets"
          value={totalTickets.toLocaleString()}
          description={`${openTickets.toLocaleString()} currently open`}
          icon={ChartColumn}
        />
        <MetricCard
          title="Resolution Rate"
          value={formatPercent(resolutionRate)}
          description={`${resolvedTickets.toLocaleString()} resolved or closed`}
          icon={TicketCheck}
        />
        <MetricCard
          title="Average Assignment"
          value={formatHours(avgAssignmentLatencyHours)}
          description="Reported to assignment"
          icon={Clock3}
        />
        <MetricCard
          title="Average Resolution"
          value={formatHours(avgResolutionHours)}
          description="Started to completed"
          icon={TimerReset}
        />
        <MetricCard
          title="SLA Breach Rate"
          value={formatPercent(slaBreachRate)}
          description={`${slaBreachedCount.toLocaleString()} breached tickets`}
          icon={ShieldAlert}
        />
        <MetricCard
          title="Service Rating"
          value={formatScore(avgCustomerServiceRating)}
          description={`${ratedJobsCount.toLocaleString()} rated jobs`}
          icon={Star}
        />
        <MetricCard
          title="Pending Confirmations"
          value={pendingConfirmationCount.toLocaleString()}
          description="Waiting on customer closure"
          icon={TicketCheck}
        />
        <MetricCard
          title="Return / Spare Obligations"
          value={`${pendingReturnObligations.toLocaleString()} / ${unusedSpareObligations.toLocaleString()}`}
          description="Old parts pending / unused spares pending"
          icon={Truck}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Service Throughput</CardTitle>
            <CardDescription>
              Ticket inflow, closures, and average field resolution for the last six months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Avg Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyThroughput.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell>{row.tickets.toLocaleString()}</TableCell>
                    <TableCell>{row.resolved.toLocaleString()}</TableCell>
                    <TableCell>{formatHours(row.avgResolutionHours)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Issue Concentration</CardTitle>
            <CardDescription>
              Most frequent problem categories handled by this service center.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issueConcentration.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No issue data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  issueConcentration.map((row) => (
                    <TableRow key={row.issue}>
                      <TableCell>{row.issue}</TableCell>
                      <TableCell>{row.count.toLocaleString()}</TableCell>
                      <TableCell>
                        {formatPercent(
                          totalTickets > 0 ? (row.count / totalTickets) * 100 : 0,
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Return Obligation Status</CardTitle>
            <CardDescription>
              Where old-part obligations currently sit in the reverse-logistics chain.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {returnStatusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No old-part return records exist yet for this service center.
              </p>
            ) : (
              returnStatusBreakdown.map((row) => (
                <div key={row.status} className="rounded-md border bg-background p-3">
                  <Badge
                    variant="outline"
                    className={returnStatusTone(row.status)}
                  >
                    {formatLabel(row.status)}
                  </Badge>
                  <p className="mt-3 text-2xl font-semibold">
                    {row.count.toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unused Spare Custody Status</CardTitle>
            <CardDescription>
              Remaining traced spares still sitting in field or partial reconciliation states.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {spareStatusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No traced spare custody records exist yet for this service center.
              </p>
            ) : (
              spareStatusBreakdown.map((row) => (
                <div key={row.status} className="rounded-md border bg-background p-3">
                  <Badge
                    variant="outline"
                    className={spareStatusTone(row.status)}
                  >
                    {formatLabel(row.status)}
                  </Badge>
                  <p className="mt-3 text-2xl font-semibold">
                    {row.count.toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Region Load</CardTitle>
            <CardDescription>
              Resolution mix by customer city for the tickets handled by this center.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Resolution Rate</TableHead>
                  <TableHead>Avg Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regionalLoad.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No regional ticket activity is available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  regionalLoad.map((row) => (
                    <TableRow key={row.city}>
                      <TableCell>{row.city}</TableCell>
                      <TableCell>{row.tickets.toLocaleString()}</TableCell>
                      <TableCell>{formatPercent(row.resolutionRate)}</TableCell>
                      <TableCell>{formatHours(row.avgResolutionHours)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manufacturer Demand Served</CardTitle>
            <CardDescription>
              Which manufacturers are driving the highest ticket load and reverse-logistics pressure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Resolution Rate</TableHead>
                  <TableHead>Pending Confirm</TableHead>
                  <TableHead>Pending Returns</TableHead>
                  <TableHead>Unused Spares</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manufacturerAnalytics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No manufacturer workload data is available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  manufacturerAnalytics.map((row) => (
                    <TableRow key={row.manufacturerId}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{row.manufacturerName}</p>
                          <p className="text-xs text-muted-foreground">
                            Avg resolution {formatHours(row.avgResolutionHours)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.tickets.toLocaleString()}</TableCell>
                      <TableCell>{formatPercent(row.resolutionRate)}</TableCell>
                      <TableCell>
                        {row.pendingConfirmation.toLocaleString()}
                      </TableCell>
                      <TableCell>{row.pendingReturns.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.unusedSpareObligations.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Technician Performance</CardTitle>
            <CardDescription>
              Throughput, customer scoring, and field obligation pressure by technician.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Resolution Rate</TableHead>
                  <TableHead>Avg Resolution</TableHead>
                  <TableHead>Service Rating</TableHead>
                  <TableHead>Pending Returns</TableHead>
                  <TableHead>Unused Spares</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicianAnalytics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No technician analytics are available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  technicianAnalytics.map((row) => (
                    <TableRow key={row.technicianId}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.ratedJobsCount.toLocaleString()} rated jobs
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.tickets.toLocaleString()}</TableCell>
                      <TableCell>{formatPercent(row.resolutionRate)}</TableCell>
                      <TableCell>{formatHours(row.avgResolutionHours)}</TableCell>
                      <TableCell>{formatScore(row.avgCustomerServiceRating)}</TableCell>
                      <TableCell>{row.pendingReturns.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.unusedSpareObligations.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

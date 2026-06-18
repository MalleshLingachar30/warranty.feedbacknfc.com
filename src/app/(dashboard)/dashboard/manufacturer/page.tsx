import { Prisma, type TicketStatus } from "@prisma/client";
import {
  AlertTriangleIcon,
  BoxesIcon,
  PackageCheckIcon,
  PackageMinusIcon,
  ShieldCheckIcon,
  TicketIcon,
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { OverviewCharts } from "@/components/manufacturer/overview-charts";
import {
  type TicketStatusSummary,
  type TopIssueRow,
} from "@/components/manufacturer/types";
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
  monthlyWarrantyCostTrend,
  topIssueByModel,
} from "@/lib/mock/manufacturer-dashboard";

import {
  decimalToNumber,
  resolveManufacturerPageContext,
} from "./_lib/server-context";

const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "reported",
  "awaiting_technician_acceptance",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

const statusTemplate: TicketStatusSummary[] = [
  { status: "new", label: "New", count: 0 },
  { status: "assigned", label: "Assigned", count: 0 },
  { status: "in_progress", label: "In Progress", count: 0 },
  { status: "awaiting_parts", label: "Awaiting Parts", count: 0 },
];

function bucketOpenStatus(status: TicketStatus) {
  switch (status) {
    case "reported":
    case "reopened":
      return "new" as const;
    case "awaiting_technician_acceptance":
    case "assigned":
    case "technician_enroute":
      return "assigned" as const;
    case "work_in_progress":
      return "in_progress" as const;
    case "pending_confirmation":
    case "escalated":
      return "awaiting_parts" as const;
    default:
      return null;
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
  const output: Array<{
    key: string;
    label: string;
  }> = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    output.push({
      key: monthKey(current),
      label: monthLabel(current),
    });
  }

  return output;
}

type ClaimTrendRow = {
  monthStart: Date;
  cost: number | null;
  claims: number;
};

type TopIssueQueryRow = {
  model: string;
  issue: string;
  incidents: number;
};

type ServiceCenterPerformanceRow = {
  id: string;
  name: string;
  city: string | null;
  totalTickets: number;
  openTickets: number;
  slaBreached: number;
  pendingConfirmation: number;
  pendingReturns: number;
  unusedSpareObligations: number;
  avgResolutionHours: number | null;
};

type DistributorPerformanceRow = {
  distributor: string;
  registeredUnits: number;
  installationJobs: number;
  pendingInstallations: number;
  customerAuthorized: number;
  avgTurnaroundDays: number | null;
};

function formatHours(value: number | null | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${numeric.toFixed(1)}h`;
}

function formatDays(value: number | null | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${numeric.toFixed(1)}d`;
}

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function obligationStatusTone(status: string) {
  switch (status) {
    case "received_by_technician":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "partially_reconciled":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default async function ManufacturerOverviewPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const ticketStatus = statusTemplate.map((entry) => ({ ...entry }));
  let topIssues: TopIssueRow[] = [...topIssueByModel];
  let monthlyTrend = [...monthlyWarrantyCostTrend];

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    activeProductsCount,
    openTicketGroups,
    pendingInstallationCount,
    pendingCustomerConfirmationCount,
    pendingReturnObligationsCount,
    unusedSpareObligationsCount,
    claimsForTrend,
    issueRows,
    oldPartReturnRows,
    unusedSpareRows,
    serviceCenterPerformance,
    distributorPerformance,
  ] = await Promise.all([
    db.product.count({
      where: {
        organizationId,
        warrantyStatus: "active",
      },
    }),
    db.ticket.groupBy({
      by: ["status"],
      where: {
        status: {
          in: OPEN_TICKET_STATUSES,
        },
        product: {
          organizationId,
        },
      },
      _count: {
        _all: true,
      },
    }),
    db.installationJob.count({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          in: [
            "pending_assignment",
            "assigned",
            "scheduled",
            "technician_enroute",
            "on_site",
            "commissioning",
            "pending_customer_authorization",
          ],
        },
      },
    }),
    db.ticket.count({
      where: {
        status: "pending_confirmation",
        product: {
          organizationId,
        },
      },
    }),
    db.ticketPartReturn.count({
      where: {
        ticket: {
          product: {
            organizationId,
          },
        },
        status: {
          in: [
            "awaiting_collection",
            "collected_by_technician",
            "received_at_service_center",
            "received_by_manufacturer",
          ],
        },
      },
    }),
    db.ticketPartDispatchItem.count({
      where: {
        dispatch: {
          ticket: {
            product: {
              organizationId,
            },
            technicianCompletedAt: {
              not: null,
            },
          },
        },
        status: {
          in: ["received_by_technician", "partially_reconciled"],
        },
      },
    }),
    db.$queryRaw<ClaimTrendRow[]>(Prisma.sql`
      SELECT
        DATE_TRUNC('month', wc.created_at) AS "monthStart",
        COALESCE(SUM(wc.total_claim_amount), 0)::double precision AS cost,
        COUNT(*)::int AS claims
      FROM warranty_claims wc
      WHERE wc.manufacturer_org_id = ${organizationId}::uuid
        AND wc.created_at >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', wc.created_at)
      ORDER BY DATE_TRUNC('month', wc.created_at) ASC
    `),
    db.$queryRaw<TopIssueQueryRow[]>(Prisma.sql`
      WITH recent_issue_tickets AS (
        SELECT
          p.product_model_id AS product_model_id,
          COALESCE(NULLIF(BTRIM(t.issue_category), ''), 'Unknown issue') AS issue
        FROM tickets t
        INNER JOIN products p ON p.id = t.product_id
        WHERE p.organization_id = ${organizationId}::uuid
          AND t.issue_category IS NOT NULL
        ORDER BY t.reported_at DESC
        LIMIT 5000
      )
      SELECT
        pm.name AS model,
        rit.issue AS issue,
        COUNT(*)::int AS incidents
      FROM recent_issue_tickets rit
      INNER JOIN product_models pm ON pm.id = rit.product_model_id
      GROUP BY pm.name, rit.issue
      ORDER BY COUNT(*) DESC, pm.name ASC, rit.issue ASC
      LIMIT 6
    `),
    db.ticketPartReturn.findMany({
      where: {
        ticket: {
          product: {
            organizationId,
          },
        },
        status: {
          in: [
            "awaiting_collection",
            "collected_by_technician",
            "received_at_service_center",
            "received_by_manufacturer",
          ],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
      select: {
        id: true,
        returnNumber: true,
        status: true,
        partName: true,
        quantity: true,
        ticket: {
          select: {
            ticketNumber: true,
          },
        },
        serviceCenter: {
          select: {
            name: true,
          },
        },
        technician: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.ticketPartDispatchItem.findMany({
      where: {
        dispatch: {
          ticket: {
            product: {
              organizationId,
            },
            technicianCompletedAt: {
              not: null,
            },
          },
        },
        status: {
          in: ["received_by_technician", "partially_reconciled"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
      select: {
        id: true,
        status: true,
        partName: true,
        quantity: true,
        spareAsset: {
          select: {
            publicCode: true,
          },
        },
        spareTag: {
          select: {
            publicCode: true,
          },
        },
        dispatch: {
          select: {
            dispatchNumber: true,
            serviceCenter: {
              select: {
                name: true,
              },
            },
            assignedTechnician: {
              select: {
                name: true,
              },
            },
            ticket: {
              select: {
                ticketNumber: true,
              },
            },
          },
        },
      },
    }),
    db.$queryRaw<ServiceCenterPerformanceRow[]>(Prisma.sql`
      WITH ticket_metrics AS (
        SELECT
          t.assigned_service_center_id AS id,
          COUNT(*)::int AS "totalTickets",
          COUNT(*) FILTER (
            WHERE t.status IN (
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
          COUNT(*) FILTER (WHERE t.sla_breached)::int AS "slaBreached",
          COUNT(*) FILTER (WHERE t.status = 'pending_confirmation')::int AS "pendingConfirmation",
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
        WHERE p.organization_id = ${organizationId}::uuid
          AND t.assigned_service_center_id IS NOT NULL
        GROUP BY t.assigned_service_center_id
      ),
      return_metrics AS (
        SELECT
          tpr.service_center_id AS id,
          COUNT(*) FILTER (
            WHERE tpr.status IN (
              'awaiting_collection',
              'collected_by_technician',
              'received_at_service_center',
              'received_by_manufacturer'
            )
          )::int AS "pendingReturns"
        FROM ticket_part_returns tpr
        INNER JOIN tickets t ON t.id = tpr.ticket_id
        INNER JOIN products p ON p.id = t.product_id
        WHERE p.organization_id = ${organizationId}::uuid
          AND tpr.service_center_id IS NOT NULL
        GROUP BY tpr.service_center_id
      ),
      spare_metrics AS (
        SELECT
          tpd.service_center_id AS id,
          COUNT(tpi.id)::int AS "unusedSpareObligations"
        FROM ticket_part_dispatch_items tpi
        INNER JOIN ticket_part_dispatches tpd ON tpd.id = tpi.dispatch_id
        INNER JOIN tickets t ON t.id = tpd.ticket_id
        INNER JOIN products p ON p.id = t.product_id
        WHERE p.organization_id = ${organizationId}::uuid
          AND t.technician_completed_at IS NOT NULL
          AND tpi.status IN ('received_by_technician', 'partially_reconciled')
          AND tpd.service_center_id IS NOT NULL
        GROUP BY tpd.service_center_id
      ),
      activity AS (
        SELECT id FROM ticket_metrics
        UNION
        SELECT id FROM return_metrics
        UNION
        SELECT id FROM spare_metrics
      )
      SELECT
        sc.id AS id,
        sc.name AS name,
        sc.city AS city,
        COALESCE(tm."totalTickets", 0)::int AS "totalTickets",
        COALESCE(tm."openTickets", 0)::int AS "openTickets",
        COALESCE(tm."slaBreached", 0)::int AS "slaBreached",
        COALESCE(tm."pendingConfirmation", 0)::int AS "pendingConfirmation",
        COALESCE(rm."pendingReturns", 0)::int AS "pendingReturns",
        COALESCE(sm."unusedSpareObligations", 0)::int AS "unusedSpareObligations",
        tm."avgResolutionHours" AS "avgResolutionHours"
      FROM activity a
      INNER JOIN service_centers sc ON sc.id = a.id
      LEFT JOIN ticket_metrics tm ON tm.id = sc.id
      LEFT JOIN return_metrics rm ON rm.id = sc.id
      LEFT JOIN spare_metrics sm ON sm.id = sc.id
      ORDER BY
        COALESCE(tm."openTickets", 0) DESC,
        COALESCE(rm."pendingReturns", 0) DESC,
        COALESCE(sm."unusedSpareObligations", 0) DESC,
        sc.name ASC
      LIMIT 8
    `),
    db.$queryRaw<DistributorPerformanceRow[]>(Prisma.sql`
      SELECT
        COALESCE(NULLIF(BTRIM(sr.distributor_name), ''), 'Unassigned') AS distributor,
        COUNT(sr.id)::int AS "registeredUnits",
        COUNT(ij.id)::int AS "installationJobs",
        COUNT(*) FILTER (
          WHERE ij.status IN (
            'pending_assignment',
            'assigned',
            'scheduled',
            'technician_enroute',
            'on_site',
            'commissioning',
            'pending_customer_authorization'
          )
        )::int AS "pendingInstallations",
        COUNT(*) FILTER (WHERE ir.customer_authorized_at IS NOT NULL)::int AS "customerAuthorized",
        AVG(
          CASE
            WHEN ir.customer_authorized_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ir.customer_authorized_at - sr.registered_at)) / 86400.0
            ELSE NULL
          END
        )::double precision AS "avgTurnaroundDays"
      FROM sale_registrations sr
      LEFT JOIN installation_jobs ij ON ij.sale_registration_id = sr.id
      LEFT JOIN installation_reports ir ON ir.installation_job_id = ij.id
      WHERE sr.organization_id = ${organizationId}::uuid
      GROUP BY COALESCE(NULLIF(BTRIM(sr.distributor_name), ''), 'Unassigned')
      ORDER BY
        COUNT(sr.id) DESC,
        COALESCE(NULLIF(BTRIM(sr.distributor_name), ''), 'Unassigned') ASC
      LIMIT 8
    `),
  ]);

  for (const group of openTicketGroups) {
    const bucket = bucketOpenStatus(group.status);
    if (!bucket) {
      continue;
    }

    const target = ticketStatus.find((entry) => entry.status === bucket);
    if (!target) {
      continue;
    }

    target.count += group._count._all;
  }

  const openTicketsCount = ticketStatus.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );

  if (claimsForTrend.length > 0) {
    const monthBuckets = buildMonthBuckets(6);
    const points = new Map(
      monthBuckets.map((bucket) => [
        bucket.key,
        {
          month: bucket.label,
          cost: 0,
          claims: 0,
        },
      ]),
    );

    for (const claim of claimsForTrend) {
      const key = monthKey(new Date(claim.monthStart));
      const point = points.get(key);

      if (!point) {
        continue;
      }

      point.cost += decimalToNumber(claim.cost);
      point.claims += decimalToNumber(claim.claims);
    }

    monthlyTrend = [...points.values()];
  }

  if (issueRows.length > 0) {
    topIssues = issueRows.map((row) => ({
      model: row.model,
      issue: row.issue,
      incidents: decimalToNumber(row.incidents),
    }));
  }

  return (
    <div>
      <PageHeader
        title="Manufacturer Overview"
        description="Control tower for installations, service execution, and reverse-logistics obligations."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          title="Active Products Under Warranty"
          value={activeProductsCount.toLocaleString()}
          description="Total registered active product units"
          icon={BoxesIcon}
        />
        <MetricCard
          title="Open Service Tickets"
          value={openTicketsCount.toLocaleString()}
          description="Across all authorized service centers"
          icon={TicketIcon}
        />
        <MetricCard
          title="Pending Installations"
          value={pendingInstallationCount.toLocaleString()}
          description="Jobs not yet completed or customer-authorized"
          icon={ShieldCheckIcon}
        />
        <MetricCard
          title="Pending Confirmations"
          value={pendingCustomerConfirmationCount.toLocaleString()}
          description="Service tickets waiting on customer closure"
          icon={PackageCheckIcon}
        />
        <MetricCard
          title="Old-Part Return Obligations"
          value={pendingReturnObligationsCount.toLocaleString()}
          description="Expected, collected, or in-transit failed parts"
          icon={PackageMinusIcon}
        />
        <MetricCard
          title="Unused Spare Obligations"
          value={unusedSpareObligationsCount.toLocaleString()}
          description="Field-held traced spares still to be reconciled"
          icon={AlertTriangleIcon}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <OverviewCharts monthlyTrend={monthlyTrend} topIssues={topIssues} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Open Ticket Breakdown</CardTitle>
          <CardDescription>Service ticket volume by status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ticketStatus.map((item) => (
            <div
              key={item.status}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{item.label}</p>
                <StatusBadge tone={item.status}>{item.label}</StatusBadge>
              </div>
              <p className="text-xl font-semibold">
                {item.count.toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pending Old-Part Returns</CardTitle>
            <CardDescription>
              Reverse-logistics obligations created from field replacements.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Service Center</TableHead>
                  <TableHead>Technician</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oldPartReturnRows.length > 0 ? (
                  oldPartReturnRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.returnNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            Ticket {row.ticket.ticketNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.partName}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty {row.quantity.toLocaleString()}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={returnStatusTone(row.status)}
                        >
                          {formatLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.serviceCenter?.name ?? "-"}</TableCell>
                      <TableCell>{row.technician?.name ?? "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No old-part return obligations are pending right now.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unused Traced Spare Custody</CardTitle>
            <CardDescription>
              Spares still with field teams after ticket completion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispatch</TableHead>
                  <TableHead>Spare</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Service Center</TableHead>
                  <TableHead>Technician</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unusedSpareRows.length > 0 ? (
                  unusedSpareRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">
                            {row.dispatch.dispatchNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Ticket {row.dispatch.ticket.ticketNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.partName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.spareAsset?.publicCode ??
                              row.spareTag?.publicCode ??
                              `Qty ${row.quantity.toLocaleString()}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={obligationStatusTone(row.status)}
                        >
                          {formatLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.dispatch.serviceCenter?.name ?? "-"}</TableCell>
                      <TableCell>
                        {row.dispatch.assignedTechnician?.name ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No unused traced spares are pending return right now.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Service Center Performance</CardTitle>
            <CardDescription>
              Ticket load and obligation pressure by service center.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Center</TableHead>
                  <TableHead>Open</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Confirm</TableHead>
                  <TableHead>Returns</TableHead>
                  <TableHead>Unused Spares</TableHead>
                  <TableHead>Avg Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceCenterPerformance.length > 0 ? (
                  serviceCenterPerformance.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.city ?? "-"} • {safeNumber(row.totalTickets).toLocaleString()} tickets
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{safeNumber(row.openTickets).toLocaleString()}</TableCell>
                      <TableCell>{safeNumber(row.slaBreached).toLocaleString()}</TableCell>
                      <TableCell>
                        {safeNumber(row.pendingConfirmation).toLocaleString()}
                      </TableCell>
                      <TableCell>{safeNumber(row.pendingReturns).toLocaleString()}</TableCell>
                      <TableCell>
                        {safeNumber(row.unusedSpareObligations).toLocaleString()}
                      </TableCell>
                      <TableCell>{formatHours(row.avgResolutionHours)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground"
                    >
                      No service-center activity is available yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distributor Performance</CardTitle>
            <CardDescription>
              Serialized sales registration and installation follow-through by distributor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distributor</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>Pending Install</TableHead>
                  <TableHead>Authorized</TableHead>
                  <TableHead>Avg Turnaround</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributorPerformance.length > 0 ? (
                  distributorPerformance.map((row) => (
                    <TableRow key={row.distributor}>
                      <TableCell className="font-medium">
                        {row.distributor}
                      </TableCell>
                      <TableCell>
                        {safeNumber(row.registeredUnits).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {safeNumber(row.installationJobs).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {safeNumber(row.pendingInstallations).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {safeNumber(row.customerAuthorized).toLocaleString()}
                      </TableCell>
                      <TableCell>{formatDays(row.avgTurnaroundDays)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      No distributor-linked registrations are available yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

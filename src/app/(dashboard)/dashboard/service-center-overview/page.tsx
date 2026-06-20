import { Prisma, type TicketStatus } from "@prisma/client";
import {
  Briefcase,
  Clock3,
  PackageMinus,
  TicketCheck,
  TimerReset,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

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
  resolveFieldServicePageContext,
} from "../_lib/service-center-context";

const OPEN_STATUSES: TicketStatus[] = [
  "reported",
  "awaiting_technician_acceptance",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

type TicketMetricRow = {
  avgAssignmentLatencyHours: number | null;
  avgResolutionHours: number | null;
};

type TechnicianResolutionRow = {
  technicianId: string;
  avgResolutionHours: number | null;
};

type TechnicianServiceRatingRow = {
  technicianId: string;
  avgCustomerServiceRating: number | null;
  ratedJobsCount: number;
};

type TechnicianObligationRow = {
  technicianId: string;
  pendingReturns: number;
  unusedSpareObligations: number;
};

type ManufacturerPressureRow = {
  manufacturerId: string;
  manufacturerName: string;
  openTickets: number;
  pendingConfirmations: number;
  pendingInstallations: number;
  pendingClaims: number;
  pendingReturns: number;
};

function formatHours(value: number | null | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${numeric.toFixed(1)}h`;
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return value.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ");
}

function statusClass(status: string) {
  switch (status) {
    case "awaiting_technician_acceptance":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "assigned":
    case "technician_enroute":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "work_in_progress":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "pending_confirmation":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "awaiting_collection":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "collected_by_technician":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "received_by_technician":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "partially_reconciled":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function metricValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default async function ServiceCenterDashboardPage() {
  const { organizationId } = await resolveFieldServicePageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [
    aggregate,
    metricRows,
    pendingInstallationsCount,
    pendingOldPartReceiptCount,
    unusedSpareReturnCount,
    acceptanceQueue,
    oldPartQueue,
    unusedSpareQueue,
    technicians,
    resolutionRows,
    serviceRatingRows,
    technicianObligationRows,
    manufacturerPressureRows,
  ] = await Promise.all([
    db.ticket.groupBy({
      by: ["status"],
      where: {
        OR: [
          {
            assignedServiceCenter: {
              organizationId,
            },
          },
          {
            assignedTechnician: {
              serviceCenter: {
                organizationId,
              },
            },
          },
        ],
      },
      _count: {
        _all: true,
      },
    }),
    db.$queryRaw<TicketMetricRow[]>(Prisma.sql`
      WITH latest_tickets AS (
        SELECT
          t.reported_at,
          t.assigned_at,
          t.technician_started_at,
          t.technician_completed_at
        FROM tickets t
        LEFT JOIN service_centers asc_sc
          ON asc_sc.id = t.assigned_service_center_id
        LEFT JOIN technicians tech
          ON tech.id = t.assigned_technician_id
        LEFT JOIN service_centers tech_sc
          ON tech_sc.id = tech.service_center_id
        WHERE asc_sc.organization_id = ${organizationId}::uuid
          OR tech_sc.organization_id = ${organizationId}::uuid
        ORDER BY t.reported_at DESC
        LIMIT 150
      )
      SELECT
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
        )::double precision AS "avgResolutionHours"
      FROM latest_tickets
    `),
    db.installationJob.count({
      where: {
        assignedServiceCenter: {
          organizationId,
        },
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
    db.ticketPartReturn.count({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: {
          in: ["awaiting_collection", "collected_by_technician"],
        },
      },
    }),
    db.ticketPartDispatchItem.count({
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
        status: {
          in: ["received_by_technician", "partially_reconciled"],
        },
      },
    }),
    db.ticket.findMany({
      where: {
        status: "awaiting_technician_acceptance",
        OR: [
          {
            assignedServiceCenter: {
              organizationId,
            },
          },
          {
            assignedTechnician: {
              serviceCenter: {
                organizationId,
              },
            },
          },
        ],
      },
      orderBy: {
        reportedAt: "desc",
      },
      take: 6,
      select: {
        id: true,
        ticketNumber: true,
        reportedAt: true,
        assignedTechnician: {
          select: {
            name: true,
          },
        },
        product: {
          select: {
            customerName: true,
            serialNumber: true,
            productModel: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    db.ticketPartReturn.findMany({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: {
          in: ["awaiting_collection", "collected_by_technician"],
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
          serviceCenter: {
            organizationId,
          },
          ticket: {
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
        dispatch: {
          select: {
            dispatchNumber: true,
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
    db.technician.findMany({
      where: {
        serviceCenter: {
          organizationId,
        },
      },
      orderBy: [{ isAvailable: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        phone: true,
        skills: true,
        isAvailable: true,
        activeJobCount: true,
        maxConcurrentJobs: true,
        totalJobsCompleted: true,
        serviceCenter: {
          select: {
            name: true,
            city: true,
          },
        },
      },
    }),
    db.$queryRaw<TechnicianResolutionRow[]>(Prisma.sql`
      SELECT
        t.assigned_technician_id AS "technicianId",
        AVG(
          EXTRACT(EPOCH FROM (t.technician_completed_at - t.technician_started_at)) / 3600.0
        )::double precision AS "avgResolutionHours"
      FROM tickets t
      INNER JOIN technicians tech ON tech.id = t.assigned_technician_id
      INNER JOIN service_centers sc ON sc.id = tech.service_center_id
      WHERE sc.organization_id = ${organizationId}::uuid
        AND t.status IN ('resolved', 'closed')
        AND t.technician_started_at IS NOT NULL
        AND t.technician_completed_at IS NOT NULL
        AND t.technician_completed_at >= t.technician_started_at
      GROUP BY t.assigned_technician_id
    `),
    db.$queryRaw<TechnicianServiceRatingRow[]>(Prisma.sql`
      SELECT
        t.assigned_technician_id AS "technicianId",
        AVG(t.customer_service_rating)::double precision AS "avgCustomerServiceRating",
        COUNT(*)::int AS "ratedJobsCount"
      FROM tickets t
      INNER JOIN technicians tech ON tech.id = t.assigned_technician_id
      INNER JOIN service_centers sc ON sc.id = tech.service_center_id
      WHERE sc.organization_id = ${organizationId}::uuid
        AND t.customer_service_rating IS NOT NULL
        AND t.status IN ('resolved', 'closed')
      GROUP BY t.assigned_technician_id
    `),
    db.$queryRaw<TechnicianObligationRow[]>(Prisma.sql`
      WITH return_counts AS (
        SELECT
          tpr.technician_id AS "technicianId",
          COUNT(*)::int AS "pendingReturns"
        FROM ticket_part_returns tpr
        INNER JOIN service_centers sc ON sc.id = tpr.service_center_id
        WHERE sc.organization_id = ${organizationId}::uuid
          AND tpr.technician_id IS NOT NULL
          AND tpr.status IN ('awaiting_collection', 'collected_by_technician')
        GROUP BY tpr.technician_id
      ),
      spare_counts AS (
        SELECT
          tpd.assigned_technician_id AS "technicianId",
          COUNT(tpi.id)::int AS "unusedSpareObligations"
        FROM ticket_part_dispatch_items tpi
        INNER JOIN ticket_part_dispatches tpd ON tpd.id = tpi.dispatch_id
        INNER JOIN service_centers sc ON sc.id = tpd.service_center_id
        INNER JOIN tickets t ON t.id = tpd.ticket_id
        WHERE sc.organization_id = ${organizationId}::uuid
          AND t.technician_completed_at IS NOT NULL
          AND tpi.status IN ('received_by_technician', 'partially_reconciled')
          AND tpd.assigned_technician_id IS NOT NULL
        GROUP BY tpd.assigned_technician_id
      ),
      activity AS (
        SELECT "technicianId" FROM return_counts
        UNION
        SELECT "technicianId" FROM spare_counts
      )
      SELECT
        a."technicianId" AS "technicianId",
        COALESCE(rc."pendingReturns", 0)::int AS "pendingReturns",
        COALESCE(sc."unusedSpareObligations", 0)::int AS "unusedSpareObligations"
      FROM activity a
      LEFT JOIN return_counts rc ON rc."technicianId" = a."technicianId"
      LEFT JOIN spare_counts sc ON sc."technicianId" = a."technicianId"
    `),
    db.$queryRaw<ManufacturerPressureRow[]>(Prisma.sql`
      WITH ticket_metrics AS (
        SELECT
          p.organization_id AS "manufacturerId",
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
          COUNT(*) FILTER (WHERE t.status = 'pending_confirmation')::int AS "pendingConfirmations"
        FROM tickets t
        INNER JOIN products p ON p.id = t.product_id
        LEFT JOIN service_centers asc_sc ON asc_sc.id = t.assigned_service_center_id
        LEFT JOIN technicians tech ON tech.id = t.assigned_technician_id
        LEFT JOIN service_centers tech_sc ON tech_sc.id = tech.service_center_id
        WHERE asc_sc.organization_id = ${organizationId}::uuid
          OR tech_sc.organization_id = ${organizationId}::uuid
        GROUP BY p.organization_id
      ),
      installation_metrics AS (
        SELECT
          ij.manufacturer_org_id AS "manufacturerId",
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
          )::int AS "pendingInstallations"
        FROM installation_jobs ij
        INNER JOIN service_centers sc ON sc.id = ij.assigned_service_center_id
        WHERE sc.organization_id = ${organizationId}::uuid
        GROUP BY ij.manufacturer_org_id
      ),
      claim_metrics AS (
        SELECT
          wc.manufacturer_org_id AS "manufacturerId",
          COUNT(*) FILTER (
            WHERE wc.status IN ('auto_generated', 'submitted', 'under_review')
          )::int AS "pendingClaims"
        FROM warranty_claims wc
        WHERE wc.service_center_org_id = ${organizationId}::uuid
        GROUP BY wc.manufacturer_org_id
      ),
      return_metrics AS (
        SELECT
          p.organization_id AS "manufacturerId",
          COUNT(*) FILTER (
            WHERE tpr.status IN ('awaiting_collection', 'collected_by_technician')
          )::int AS "pendingReturns"
        FROM ticket_part_returns tpr
        INNER JOIN tickets t ON t.id = tpr.ticket_id
        INNER JOIN products p ON p.id = t.product_id
        INNER JOIN service_centers sc ON sc.id = tpr.service_center_id
        WHERE sc.organization_id = ${organizationId}::uuid
        GROUP BY p.organization_id
      ),
      activity AS (
        SELECT "manufacturerId" FROM ticket_metrics
        UNION
        SELECT "manufacturerId" FROM installation_metrics
        UNION
        SELECT "manufacturerId" FROM claim_metrics
        UNION
        SELECT "manufacturerId" FROM return_metrics
      )
      SELECT
        org.id AS "manufacturerId",
        org.name AS "manufacturerName",
        COALESCE(tm."openTickets", 0)::int AS "openTickets",
        COALESCE(tm."pendingConfirmations", 0)::int AS "pendingConfirmations",
        COALESCE(im."pendingInstallations", 0)::int AS "pendingInstallations",
        COALESCE(cm."pendingClaims", 0)::int AS "pendingClaims",
        COALESCE(rm."pendingReturns", 0)::int AS "pendingReturns"
      FROM activity a
      INNER JOIN organizations org ON org.id = a."manufacturerId"
      LEFT JOIN ticket_metrics tm ON tm."manufacturerId" = org.id
      LEFT JOIN installation_metrics im ON im."manufacturerId" = org.id
      LEFT JOIN claim_metrics cm ON cm."manufacturerId" = org.id
      LEFT JOIN return_metrics rm ON rm."manufacturerId" = org.id
      ORDER BY
        COALESCE(tm."openTickets", 0) DESC,
        COALESCE(im."pendingInstallations", 0) DESC,
        COALESCE(cm."pendingClaims", 0) DESC,
        org.name ASC
      LIMIT 8
    `),
  ]);

  const openTicketsCount = aggregate
    .filter((entry) => OPEN_STATUSES.includes(entry.status))
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const awaitingAcceptanceCount = aggregate
    .filter((entry) => entry.status === "awaiting_technician_acceptance")
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const inProgressTicketsCount = aggregate
    .filter((entry) =>
      ["assigned", "technician_enroute", "work_in_progress"].includes(
        entry.status,
      ),
    )
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const pendingConfirmationCount = aggregate
    .filter((entry) => entry.status === "pending_confirmation")
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const avgAssignmentLatencyHours = metricValue(
    metricRows[0]?.avgAssignmentLatencyHours,
  );
  const avgResolutionHours = metricValue(metricRows[0]?.avgResolutionHours);

  const avgHoursByTechnician = new Map(
    resolutionRows.map((row) => [
      row.technicianId,
      decimalToNumber(row.avgResolutionHours),
    ]),
  );
  const serviceRatingByTechnician = new Map(
    serviceRatingRows.map((row) => [
      row.technicianId,
      {
        average: decimalToNumber(row.avgCustomerServiceRating),
        ratedJobsCount: row.ratedJobsCount,
      },
    ]),
  );
  const obligationByTechnician = new Map(
    technicianObligationRows.map((row) => [
      row.technicianId,
      {
        pendingReturns: row.pendingReturns,
        unusedSpareObligations: row.unusedSpareObligations,
      },
    ]),
  );

  return (
    <div>
      <PageHeader
        title="Service Center Overview"
        description="Operational control tower for technician dispatch, service execution, installation flow, and reverse logistics."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          title="Open Tickets"
          value={openTicketsCount.toLocaleString()}
          description={`All active service ticket states • Avg assignment ${formatHours(avgAssignmentLatencyHours)}`}
          icon={TicketCheck}
        />
        <MetricCard
          title="Awaiting Acceptance"
          value={awaitingAcceptanceCount.toLocaleString()}
          description="Jobs pending technician accept/reject action"
          icon={UserCheck}
        />
        <MetricCard
          title="Field Work In Progress"
          value={inProgressTicketsCount.toLocaleString()}
          description={`${pendingInstallationsCount.toLocaleString()} active installation jobs in parallel`}
          icon={Briefcase}
        />
        <MetricCard
          title="Pending Confirmation"
          value={pendingConfirmationCount.toLocaleString()}
          description="Waiting for customer resolution confirmation"
          icon={Clock3}
        />
        <MetricCard
          title="Old Parts Pending Receipt"
          value={pendingOldPartReceiptCount.toLocaleString()}
          description="Failed parts not yet received at the service center"
          icon={PackageMinus}
        />
        <MetricCard
          title="Unused Spares Pending Return"
          value={unusedSpareReturnCount.toLocaleString()}
          description={`Pending return after completion • Avg resolution ${formatHours(avgResolutionHours)}`}
          icon={TimerReset}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Technician Acceptance Queue</CardTitle>
            <CardDescription>
              Tickets waiting for technician acknowledgement.{" "}
              <Link href="/dashboard/tickets" className="text-indigo-700 hover:underline">
                Open full ticket queue
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead>Reported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acceptanceQueue.length > 0 ? (
                  acceptanceQueue.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/tickets/${ticket.id}`}
                          className="font-medium text-indigo-700 hover:underline"
                        >
                          {ticket.ticketNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{ticket.product.productModel.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ticket.product.serialNumber ?? "Serial unavailable"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{ticket.assignedTechnician?.name ?? "-"}</TableCell>
                      <TableCell>{formatDateTime(ticket.reportedAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No tickets are waiting for technician acceptance right now.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Old Parts Pending Receipt</CardTitle>
            <CardDescription>
              Failed parts still expected back from the field.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Technician</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oldPartQueue.length > 0 ? (
                  oldPartQueue.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium">{row.returnNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            Ticket {row.ticket.ticketNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{row.partName}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty {row.quantity.toLocaleString()}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusClass(row.status)}
                        >
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.technician?.name ?? "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No old-part receipts are pending right now.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unused Traced Spares</CardTitle>
            <CardDescription>
              Spare items still in technician custody after job completion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispatch</TableHead>
                  <TableHead>Spare</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Technician</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unusedSpareQueue.length > 0 ? (
                  unusedSpareQueue.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium">{row.dispatch.dispatchNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            Ticket {row.dispatch.ticket.ticketNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{row.partName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.spareAsset?.publicCode ??
                              `Qty ${row.quantity.toLocaleString()}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusClass(row.status)}
                        >
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.dispatch.assignedTechnician?.name ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No traced spare returns are pending right now.
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
            <CardTitle>Technician Workload & Performance</CardTitle>
            <CardDescription>
              Current field load, reverse-logistics obligations, and quality signal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>Pending Returns</TableHead>
                  <TableHead>Unused Spares</TableHead>
                  <TableHead>Avg Resolution</TableHead>
                  <TableHead>Service Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.length > 0 ? (
                  technicians.map((technician) => {
                    const avgResolution = avgHoursByTechnician.get(technician.id) ?? 0;
                    const serviceRating =
                      serviceRatingByTechnician.get(technician.id) ?? null;
                    const obligations = obligationByTechnician.get(technician.id) ?? {
                      pendingReturns: 0,
                      unusedSpareObligations: 0,
                    };

                    return (
                      <TableRow key={technician.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium">{technician.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {technician.phone}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {technician.isAvailable ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700"
                            >
                              Available
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700"
                            >
                              Busy
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {technician.activeJobCount}/{technician.maxConcurrentJobs}
                        </TableCell>
                        <TableCell>
                          {obligations.pendingReturns.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {obligations.unusedSpareObligations.toLocaleString()}
                        </TableCell>
                        <TableCell>{formatHours(avgResolution)}</TableCell>
                        <TableCell>
                          {serviceRating ? (
                            <div className="space-y-0.5">
                              <p>{serviceRating.average.toFixed(1)}/5</p>
                              <p className="text-xs text-muted-foreground">
                                {serviceRating.ratedJobsCount.toLocaleString()} rated
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No technicians are registered for this service-center organization.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manufacturer Workload</CardTitle>
            <CardDescription>
              Active load and obligations grouped by manufacturer served by this center.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Open Tickets</TableHead>
                  <TableHead>Pending Confirm</TableHead>
                  <TableHead>Pending Install</TableHead>
                  <TableHead>Pending Claims</TableHead>
                  <TableHead>Pending Returns</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manufacturerPressureRows.length > 0 ? (
                  manufacturerPressureRows.map((row) => (
                    <TableRow key={row.manufacturerId}>
                      <TableCell className="font-medium">
                        {row.manufacturerName}
                      </TableCell>
                      <TableCell>{row.openTickets.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.pendingConfirmations.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {row.pendingInstallations.toLocaleString()}
                      </TableCell>
                      <TableCell>{row.pendingClaims.toLocaleString()}</TableCell>
                      <TableCell>{row.pendingReturns.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No manufacturer-linked workload is available yet.
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

import { Prisma } from "@prisma/client";
import { BarChart3, MapPinned, ShieldAlert, Wrench } from "lucide-react";

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

import { resolveManufacturerPageContext } from "../_lib/server-context";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

type AnalyticsSummaryRow = {
  totalTickets: number;
  resolvedTickets: number;
  slaBreachedCount: number;
  avgResolutionHours: number | null;
};

type ReliabilityRow = {
  id: string;
  model: string;
  modelNumber: string | null;
  units: number;
  incidents: number;
};

type CommonIssueRow = {
  issue: string;
  count: number;
};

type RegionalPerformanceRow = {
  city: string | null;
  tickets: number;
  resolved: number;
  avgResolutionHours: number | null;
};

type TechnicianPerformanceRow = {
  id: string;
  name: string;
  tickets: number;
  resolved: number;
  avgResolutionHours: number | null;
};

type ActivationCountRow = {
  qr: number;
  nfc: number;
  unknown: number;
};

export default async function ManufacturerAnalyticsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    summaryRow,
    reliabilityRows,
    commonIssueRows,
    regionalRows,
    technicianRows,
    activationRow,
    stickerScanTop,
  ] = await Promise.all([
    db.$queryRaw<AnalyticsSummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "totalTickets",
        COUNT(*) FILTER (WHERE t.status IN ('resolved', 'closed'))::int AS "resolvedTickets",
        COUNT(*) FILTER (WHERE t.sla_breached)::int AS "slaBreachedCount",
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
    `),
    db.$queryRaw<ReliabilityRow[]>(Prisma.sql`
      SELECT
        pm.id AS id,
        pm.name AS model,
        pm.model_number AS "modelNumber",
        COUNT(DISTINCT p.id)::int AS units,
        COUNT(t.id)::int AS incidents
      FROM product_models pm
      LEFT JOIN products p ON p.product_model_id = pm.id
      LEFT JOIN tickets t ON t.product_id = p.id
      WHERE pm.organization_id = ${organizationId}::uuid
      GROUP BY pm.id, pm.name, pm.model_number
      ORDER BY pm.created_at ASC
    `),
    db.$queryRaw<CommonIssueRow[]>(Prisma.sql`
      SELECT
        COALESCE(NULLIF(BTRIM(t.issue_category), ''), 'General issue') AS issue,
        COUNT(*)::int AS count
      FROM tickets t
      INNER JOIN products p ON p.id = t.product_id
      WHERE p.organization_id = ${organizationId}::uuid
      GROUP BY COALESCE(NULLIF(BTRIM(t.issue_category), ''), 'General issue')
      ORDER BY COUNT(*) DESC, issue ASC
      LIMIT 10
    `),
    db.$queryRaw<RegionalPerformanceRow[]>(Prisma.sql`
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
      WHERE p.organization_id = ${organizationId}::uuid
      GROUP BY COALESCE(p.customer_city, 'Unknown')
      ORDER BY COUNT(*) DESC, city ASC
    `),
    db.$queryRaw<TechnicianPerformanceRow[]>(Prisma.sql`
      SELECT
        tech.id AS id,
        tech.name AS name,
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
      INNER JOIN technicians tech ON tech.id = t.assigned_technician_id
      INNER JOIN products p ON p.id = t.product_id
      WHERE p.organization_id = ${organizationId}::uuid
      GROUP BY tech.id, tech.name
      ORDER BY COUNT(*) DESC, tech.name ASC
    `),
    db.$queryRaw<ActivationCountRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE LOWER(BTRIM(COALESCE(p.metadata ->> 'activationSource', ''))) = 'qr'
        )::int AS qr,
        COUNT(*) FILTER (
          WHERE LOWER(BTRIM(COALESCE(p.metadata ->> 'activationSource', ''))) = 'nfc'
        )::int AS nfc,
        COUNT(*) FILTER (
          WHERE LOWER(BTRIM(COALESCE(p.metadata ->> 'activationSource', ''))) NOT IN ('qr', 'nfc')
        )::int AS unknown
      FROM products p
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.warranty_status <> 'pending_activation'
    `),
    db.stickerScanEvent
      .groupBy({
        by: ["stickerNumber"],
        where: {
          organizationId,
          scannedAt: {
            gte: thirtyDaysAgo,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 10,
      })
      .catch((error) => {
        console.error("Sticker scan analytics query failed", error);
        return [];
      }),
  ]);

  const resolvedTickets = toNumber(summaryRow[0]?.resolvedTickets);
  const totalTickets = toNumber(summaryRow[0]?.totalTickets);
  const slaBreachedCount = toNumber(summaryRow[0]?.slaBreachedCount);
  const slaBreachRate =
    totalTickets > 0 ? (slaBreachedCount / totalTickets) * 100 : 0;

  const avgResolutionHours = toNumber(summaryRow[0]?.avgResolutionHours);

  const reliabilityByModel = reliabilityRows
    .map((row) => {
      const unitCount = toNumber(row.units);
      const incidents = toNumber(row.incidents);

      return {
        id: row.id,
        model: row.model,
        modelNumber: row.modelNumber ?? "-",
        units: unitCount,
        incidents,
        failureRate: unitCount > 0 ? (incidents / unitCount) * 100 : 0,
      };
    })
    .sort((left, right) => right.failureRate - left.failureRate);

  const commonIssues = commonIssueRows.map((row) => ({
    issue: row.issue,
    count: toNumber(row.count),
  }));

  const regionalPerformance = regionalRows.map((row) => {
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

  const technicianPerformance = technicianRows.map((row) => {
    const tickets = toNumber(row.tickets);
    const resolved = toNumber(row.resolved);

    return {
      id: row.id,
      name: row.name,
      tickets,
      resolved,
      resolutionRate: tickets > 0 ? (resolved / tickets) * 100 : 0,
      avgResolutionHours: toNumber(row.avgResolutionHours),
    };
  });

  const activationCounts = {
    qr: toNumber(activationRow[0]?.qr),
    nfc: toNumber(activationRow[0]?.nfc),
    unknown: toNumber(activationRow[0]?.unknown),
  };

  const totalActivations =
    activationCounts.qr + activationCounts.nfc + activationCounts.unknown;

  const topScannedStickers = stickerScanTop.map((row) => ({
    stickerNumber: row.stickerNumber,
    scans: row._count?.id ?? 0,
  }));

  const totalScansLast30Days = topScannedStickers.reduce(
    (sum, row) => sum + row.scans,
    0,
  );

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Reliability, issue concentration, regional trends, and technician throughput."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Tickets"
          value={totalTickets.toLocaleString()}
          description={`${resolvedTickets.toLocaleString()} resolved/closed`}
          icon={BarChart3}
        />
        <MetricCard
          title="Average Resolution"
          value={formatHours(avgResolutionHours)}
          description="From started to completed timestamps"
          icon={Wrench}
        />
        <MetricCard
          title="SLA Breach Rate"
          value={formatPercent(slaBreachRate)}
          description={`${slaBreachedCount.toLocaleString()} tickets breached`}
          icon={ShieldAlert}
        />
        <MetricCard
          title="Covered Regions"
          value={regionalPerformance.length.toLocaleString()}
          description="Cities with ticket activity"
          icon={MapPinned}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sticker Activation Sources</CardTitle>
            <CardDescription>
              Warranty activations captured from sticker links with{" "}
              <span className="font-mono text-xs">?src=qr</span> /{" "}
              <span className="font-mono text-xs">?src=nfc</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">QR</p>
              <p className="text-xl font-semibold">
                {activationCounts.qr.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(
                  totalActivations > 0
                    ? (activationCounts.qr / totalActivations) * 100
                    : 0,
                )}
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">NFC</p>
              <p className="text-xl font-semibold">
                {activationCounts.nfc.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(
                  totalActivations > 0
                    ? (activationCounts.nfc / totalActivations) * 100
                    : 0,
                )}
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">Unknown</p>
              <p className="text-xl font-semibold">
                {activationCounts.unknown.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(
                  totalActivations > 0
                    ? (activationCounts.unknown / totalActivations) * 100
                    : 0,
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Scanned Stickers</CardTitle>
            <CardDescription>
              Most frequently opened sticker URLs in the last 30 days (
              {totalScansLast30Days.toLocaleString()} total scans tracked).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sticker</TableHead>
                  <TableHead className="text-right">Scans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topScannedStickers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      No scan data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  topScannedStickers.map((row) => (
                    <TableRow key={row.stickerNumber}>
                      <TableCell>#{row.stickerNumber}</TableCell>
                      <TableCell className="text-right">
                        {row.scans.toLocaleString()}
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
            <CardTitle>Product Reliability</CardTitle>
            <CardDescription>
              Incident rate by product model against installed base.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Incidents</TableHead>
                  <TableHead>Failure Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reliabilityByModel.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No product model data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  reliabilityByModel.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{row.model}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.modelNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.units.toLocaleString()}</TableCell>
                      <TableCell>{row.incidents.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatPercent(row.failureRate)}
                        </Badge>
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
            <CardTitle>Common Issues</CardTitle>
            <CardDescription>
              Most frequently reported issue categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Incidents</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commonIssues.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No issue data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  commonIssues.map((row) => (
                    <TableRow key={row.issue}>
                      <TableCell>{row.issue}</TableCell>
                      <TableCell>{row.count.toLocaleString()}</TableCell>
                      <TableCell>
                        {formatPercent(
                          totalTickets > 0
                            ? (row.count / totalTickets) * 100
                            : 0,
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
            <CardTitle>Regional Performance</CardTitle>
            <CardDescription>
              Resolution throughput by customer region.
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
                {regionalPerformance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No regional performance data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  regionalPerformance.map((row) => (
                    <TableRow key={row.city}>
                      <TableCell>{row.city}</TableCell>
                      <TableCell>{row.tickets.toLocaleString()}</TableCell>
                      <TableCell>{formatPercent(row.resolutionRate)}</TableCell>
                      <TableCell>
                        {formatHours(row.avgResolutionHours)}
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
            <CardTitle>Technician Performance</CardTitle>
            <CardDescription>
              Assignment and completion throughput for active technicians.
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicianPerformance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No technician metrics available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  technicianPerformance.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.tickets.toLocaleString()}</TableCell>
                      <TableCell>{formatPercent(row.resolutionRate)}</TableCell>
                      <TableCell>
                        {formatHours(row.avgResolutionHours)}
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

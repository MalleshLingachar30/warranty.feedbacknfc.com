import { Prisma } from "@prisma/client";
import { Activity, AlertTriangle, RotateCcw, ScanSearch } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
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

import { resolveServiceCenterPageContext } from "../../_lib/service-center-context";

type MonthlyRow = {
  month: Date;
  inwardCount: number;
  qcFailCount: number;
  returnedToStockCount: number;
};

type EngineerRow = {
  engineerName: string;
  totalOrders: number;
  qcFailed: number;
  returnedToStock: number;
};

function monthLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default async function DepotInternalServicesAnalyticsPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [
    last30Inward,
    qcDecisionCount,
    qcFailEventCount,
    returnedToStockCount,
    monthlyRows,
    engineerRows,
  ] = await Promise.all([
    db.internalServiceOrder.count({
      where: {
        serviceCenter: { organizationId },
        receivedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    db.internalServiceTimeline.count({
      where: {
        internalServiceOrder: {
          serviceCenter: { organizationId },
        },
        eventType: {
          in: ["qa_failed", "ready_for_disposition"],
        },
      },
    }),
    db.internalServiceTimeline.count({
      where: {
        internalServiceOrder: {
          serviceCenter: { organizationId },
        },
        eventType: "qa_failed",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: { organizationId },
        finalDisposition: "returned_to_stock",
        status: {
          in: ["completed", "closed"],
        },
      },
    }),
    db.$queryRaw<MonthlyRow[]>(Prisma.sql`
      SELECT
        date_trunc('month', iso.received_at) AS month,
        COUNT(*)::int AS "inwardCount",
        COUNT(*) FILTER (WHERE iso.status = 'qa_failed')::int AS "qcFailCount",
        COUNT(*) FILTER (
          WHERE iso.final_disposition = 'returned_to_stock'
            AND iso.status IN ('completed', 'closed')
        )::int AS "returnedToStockCount"
      FROM internal_service_orders iso
      INNER JOIN service_centers sc ON sc.id = iso.service_center_id
      WHERE sc.organization_id = ${organizationId}::uuid
        AND iso.received_at IS NOT NULL
      GROUP BY date_trunc('month', iso.received_at)
      ORDER BY date_trunc('month', iso.received_at) DESC
      LIMIT 6
    `),
    db.$queryRaw<EngineerRow[]>(Prisma.sql`
      SELECT
        COALESCE(tech.name, 'Unassigned') AS "engineerName",
        COUNT(*)::int AS "totalOrders",
        COUNT(*) FILTER (WHERE iso.status = 'qa_failed')::int AS "qcFailed",
        COUNT(*) FILTER (
          WHERE iso.final_disposition = 'returned_to_stock'
            AND iso.status IN ('completed', 'closed')
        )::int AS "returnedToStock"
      FROM internal_service_orders iso
      INNER JOIN service_centers sc ON sc.id = iso.service_center_id
      LEFT JOIN technicians tech ON tech.id = iso.assigned_technician_id
      WHERE sc.organization_id = ${organizationId}::uuid
      GROUP BY COALESCE(tech.name, 'Unassigned')
      ORDER BY COUNT(*) DESC, COALESCE(tech.name, 'Unassigned') ASC
      LIMIT 8
    `),
  ]);

  const qcFailRate =
    qcDecisionCount === 0 ? "0.0%" : `${((qcFailEventCount / qcDecisionCount) * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Services Analytics"
        description="Depot metrics for inward pressure, QA fallout, engineer throughput, and saleable recovery outcomes."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Inward Last 30 Days"
          value={String(last30Inward)}
          description="Fresh internal-service receipts captured into depot inventory."
          icon={ScanSearch}
        />
        <MetricCard
          title="QC Decisions"
          value={String(qcDecisionCount)}
          description="Total pass/fail decision events recorded at QA."
          icon={Activity}
        />
        <MetricCard
          title="QC Fail Rate"
          value={qcFailRate}
          description="Share of QA decisions that resulted in rework."
          icon={AlertTriangle}
        />
        <MetricCard
          title="Returned To Stock"
          value={String(returnedToStockCount)}
          description="Units recovered back into depot saleable stock."
          icon={RotateCcw}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly inward and recovery</CardTitle>
            <CardDescription>
              Month-by-month inward volume, QA fallout, and returned-to-stock outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Inward</TableHead>
                  <TableHead>QC Failures</TableHead>
                  <TableHead>Returned To Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyRows.map((row) => (
                  <TableRow key={row.month.toISOString()}>
                    <TableCell>{monthLabel(row.month)}</TableCell>
                    <TableCell>{row.inwardCount}</TableCell>
                    <TableCell>{row.qcFailCount}</TableCell>
                    <TableCell>{row.returnedToStockCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engineer outcome mix</CardTitle>
            <CardDescription>
              Bench throughput and QA fallout by assigned engineer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Total Orders</TableHead>
                  <TableHead>QC Failed</TableHead>
                  <TableHead>Returned To Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engineerRows.map((row) => (
                  <TableRow key={row.engineerName}>
                    <TableCell>{row.engineerName}</TableCell>
                    <TableCell>{row.totalOrders}</TableCell>
                    <TableCell>{row.qcFailed}</TableCell>
                    <TableCell>{row.returnedToStock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

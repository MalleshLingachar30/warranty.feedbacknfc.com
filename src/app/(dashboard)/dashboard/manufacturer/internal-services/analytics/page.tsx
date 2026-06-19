import { Prisma } from "@prisma/client";
import { Activity, AlertTriangle, Building2, RotateCcw } from "lucide-react";

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

import { resolveManufacturerPageContext } from "../../_lib/server-context";

type MonthlyRow = {
  month: Date;
  inwardCount: number;
  qcFailCount: number;
  returnedToStockCount: number;
};

type DepotRow = {
  serviceCenterName: string;
  city: string | null;
  inwardCount: number;
  qcFailed: number;
  returnedToStock: number;
};

type ModelRow = {
  modelName: string;
  modelNumber: string | null;
  inwardCount: number;
  qcFailed: number;
  returnedToStock: number;
};

function monthLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default async function ManufacturerInternalServicesAnalyticsPage() {
  const { organizationId, organizationName } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const [
    last30Inward,
    qcDecisionCount,
    qcFailEventCount,
    returnedToStockCount,
    monthlyRows,
    depotRows,
    modelRows,
  ] = await Promise.all([
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        receivedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    db.internalServiceTimeline.count({
      where: {
        internalServiceOrder: {
          manufacturerOrgId: organizationId,
        },
        eventType: {
          in: ["qa_failed", "ready_for_disposition"],
        },
      },
    }),
    db.internalServiceTimeline.count({
      where: {
        internalServiceOrder: {
          manufacturerOrgId: organizationId,
        },
        eventType: "qa_failed",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
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
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM internal_service_timeline ist
            WHERE ist.internal_service_order_id = iso.id
              AND ist.event_type = 'qa_failed'
          )
        )::int AS "qcFailCount",
        COUNT(*) FILTER (
          WHERE iso.final_disposition = 'returned_to_stock'
            AND iso.status IN ('completed', 'closed')
        )::int AS "returnedToStockCount"
      FROM internal_service_orders iso
      WHERE iso.manufacturer_org_id = ${organizationId}::uuid
        AND iso.received_at IS NOT NULL
      GROUP BY date_trunc('month', iso.received_at)
      ORDER BY date_trunc('month', iso.received_at) DESC
      LIMIT 6
    `),
    db.$queryRaw<DepotRow[]>(Prisma.sql`
      SELECT
        sc.name AS "serviceCenterName",
        sc.city AS city,
        COUNT(*)::int AS "inwardCount",
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM internal_service_timeline ist
            WHERE ist.internal_service_order_id = iso.id
              AND ist.event_type = 'qa_failed'
          )
        )::int AS "qcFailed",
        COUNT(*) FILTER (
          WHERE iso.final_disposition = 'returned_to_stock'
            AND iso.status IN ('completed', 'closed')
        )::int AS "returnedToStock"
      FROM internal_service_orders iso
      INNER JOIN service_centers sc ON sc.id = iso.service_center_id
      WHERE iso.manufacturer_org_id = ${organizationId}::uuid
      GROUP BY sc.name, sc.city
      ORDER BY COUNT(*) DESC, sc.name ASC
      LIMIT 8
    `),
    db.$queryRaw<ModelRow[]>(Prisma.sql`
      SELECT
        pm.name AS "modelName",
        pm.model_number AS "modelNumber",
        COUNT(*)::int AS "inwardCount",
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM internal_service_timeline ist
            WHERE ist.internal_service_order_id = iso.id
              AND ist.event_type = 'qa_failed'
          )
        )::int AS "qcFailed",
        COUNT(*) FILTER (
          WHERE iso.final_disposition = 'returned_to_stock'
            AND iso.status IN ('completed', 'closed')
        )::int AS "returnedToStock"
      FROM internal_service_orders iso
      INNER JOIN asset_identities ai ON ai.id = iso.asset_id
      INNER JOIN product_models pm ON pm.id = ai.product_model_id
      WHERE iso.manufacturer_org_id = ${organizationId}::uuid
      GROUP BY pm.name, pm.model_number
      ORDER BY COUNT(*) DESC, pm.name ASC
      LIMIT 8
    `),
  ]);

  const qcFailRate =
    qcDecisionCount === 0 ? "0.0%" : `${((qcFailEventCount / qcDecisionCount) * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Services Analytics"
        description={`Manufacturer-wide analytics for inward load, QA fallout, and returned-to-stock recovery across ${organizationName ?? "the internal service network"}.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Inward Last 30 Days"
          value={String(last30Inward)}
          description="New internal-service orders received into depots."
          icon={Building2}
        />
        <MetricCard
          title="QC Decisions"
          value={String(qcDecisionCount)}
          description="Total pass/fail QA outcomes recorded across internal service."
          icon={Activity}
        />
        <MetricCard
          title="QC Fail Rate"
          value={qcFailRate}
          description="How often repaired units fall back into rework after QA."
          icon={AlertTriangle}
        />
        <MetricCard
          title="Returned To Stock"
          value={String(returnedToStockCount)}
          description="Units recovered into stock-ready outcomes after depot service."
          icon={RotateCcw}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Monthly inward / QC / recovery</CardTitle>
            <CardDescription>
              Six-month view of internal intake and returned-to-stock outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Inward</TableHead>
                  <TableHead>QC Failed</TableHead>
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

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Depot outcome mix</CardTitle>
            <CardDescription>
              Compare inward pressure, QA fallout, and stock recovery by depot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Depot</TableHead>
                  <TableHead>Inward</TableHead>
                  <TableHead>QC Failed</TableHead>
                  <TableHead>Returned To Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depotRows.map((row) => (
                  <TableRow key={`${row.serviceCenterName}-${row.city ?? "na"}`}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.serviceCenterName}</div>
                      <div className="text-xs text-slate-500">{row.city ?? "Unknown city"}</div>
                    </TableCell>
                    <TableCell>{row.inwardCount}</TableCell>
                    <TableCell>{row.qcFailed}</TableCell>
                    <TableCell>{row.returnedToStock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Model reliability / recovery</CardTitle>
            <CardDescription>
              Product models creating the most internal-service pressure and recovery work.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Inward</TableHead>
                  <TableHead>QC Failed</TableHead>
                  <TableHead>Returned To Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelRows.map((row) => (
                  <TableRow key={`${row.modelName}-${row.modelNumber ?? "na"}`}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.modelName}</div>
                      <div className="text-xs text-slate-500">{row.modelNumber ?? "-"}</div>
                    </TableCell>
                    <TableCell>{row.inwardCount}</TableCell>
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

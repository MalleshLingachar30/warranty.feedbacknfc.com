import { InternalServiceStatus, InternalServiceType, Prisma } from "@prisma/client";
import {
  Boxes,
  ClipboardCheck,
  Factory,
  PackageSearch,
  RotateCcw,
  Wrench,
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

import { resolveManufacturerPageContext } from "../_lib/server-context";

const TRIAGE_STATUSES: InternalServiceStatus[] = [
  "inward_received",
  "awaiting_triage",
];
const ACTIVE_BENCH_STATUSES: InternalServiceStatus[] = [
  "under_diagnosis",
  "awaiting_parts",
  "repair_in_progress",
];
const QC_STATUSES: InternalServiceStatus[] = ["awaiting_qc", "qa_failed"];

function statusLabel(status: InternalServiceStatus) {
  return status.replace(/_/g, " ");
}

function serviceTypeLabel(value: InternalServiceType) {
  return value.replace(/_/g, " ");
}

function statusTone(status: InternalServiceStatus) {
  switch (status) {
    case "inward_received":
    case "awaiting_triage":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "under_diagnosis":
    case "awaiting_parts":
    case "repair_in_progress":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "awaiting_qc":
    case "qa_failed":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "ready_for_disposition":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "completed":
    case "closed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
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

type ServiceCenterLoadRow = {
  id: string;
  name: string;
  city: string | null;
  openOrders: number;
  awaitingQc: number;
  readyForDisposition: number;
};

export default async function ManufacturerInternalServicesOverviewPage() {
  const { organizationId, organizationName } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const [
    triageCount,
    activeBenchCount,
    awaitingQcCount,
    readyForDispositionCount,
    saleableRecoveryCount,
    openOrderCount,
    recentOrders,
    serviceCenterLoadRows,
  ] = await Promise.all([
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          in: TRIAGE_STATUSES,
        },
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          in: ACTIVE_BENCH_STATUSES,
        },
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          in: QC_STATUSES,
        },
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        status: "ready_for_disposition",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        isSaleableAfterService: true,
        status: {
          in: ["completed", "closed"],
        },
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          notIn: ["closed", "cancelled"],
        },
      },
    }),
    db.internalServiceOrder.findMany({
      where: {
        manufacturerOrgId: organizationId,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        serviceType: true,
        status: true,
        priority: true,
        receivedAt: true,
        asset: {
          select: {
            serialNumber: true,
            publicCode: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
          },
        },
        serviceCenter: {
          select: {
            name: true,
            city: true,
          },
        },
      },
    }),
    db.$queryRaw<ServiceCenterLoadRow[]>(Prisma.sql`
      SELECT
        sc.id AS id,
        sc.name AS name,
        sc.city AS city,
        COUNT(*) FILTER (
          WHERE iso.status NOT IN ('closed', 'cancelled')
        )::int AS "openOrders",
        COUNT(*) FILTER (
          WHERE iso.status IN ('awaiting_qc', 'qa_failed')
        )::int AS "awaitingQc",
        COUNT(*) FILTER (
          WHERE iso.status = 'ready_for_disposition'
        )::int AS "readyForDisposition"
      FROM internal_service_orders iso
      INNER JOIN service_centers sc ON sc.id = iso.service_center_id
      WHERE iso.manufacturer_org_id = ${organizationId}::uuid
      GROUP BY sc.id, sc.name, sc.city
      ORDER BY COUNT(*) FILTER (
        WHERE iso.status NOT IN ('closed', 'cancelled')
      ) DESC, sc.name ASC
      LIMIT 8
    `),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Services"
        description={`Manufacturer control tower for inward receipt, depot repair, QA, and disposition across ${organizationName ?? "your network"}.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Awaiting Inward / Triage"
          value={String(triageCount)}
          description="Faulty units that still need intake or bench routing."
          icon={PackageSearch}
        />
        <MetricCard
          title="Active Bench Work"
          value={String(activeBenchCount)}
          description="Orders currently under diagnosis, waiting on parts, or being repaired."
          icon={Wrench}
        />
        <MetricCard
          title="Awaiting QC"
          value={String(awaitingQcCount)}
          description="Units ready for validation, calibration, or rework after QC failure."
          icon={ClipboardCheck}
        />
        <MetricCard
          title="Ready For Disposition"
          value={String(readyForDispositionCount)}
          description="Units waiting for return, stock release, refurb saleability, or scrap decisions."
          icon={Boxes}
        />
        <MetricCard
          title="Saleable Recoveries"
          value={String(saleableRecoveryCount)}
          description="Units already recovered into a saleable or stock-return outcome."
          icon={RotateCcw}
        />
        <MetricCard
          title="Open Internal Orders"
          value={String(openOrderCount)}
          description="Total internal depot work still moving through the module."
          icon={Factory}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Internal Service Orders</CardTitle>
            <CardDescription>
              Live internal repair orders separated from warranty tickets and customer-facing queues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                No internal service orders exist yet. Use Inward Receipt to start the first depot workflow.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Depot</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{order.orderNumber}</div>
                        <div className="text-xs text-slate-500">
                          {serviceTypeLabel(order.serviceType)} · {order.priority}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {order.asset.productModel.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {order.asset.productModel.modelNumber ?? "No model"} ·{" "}
                          {order.asset.serialNumber ?? order.asset.publicCode}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{order.serviceCenter.name}</div>
                        <div className="text-xs text-slate-500">
                          {order.serviceCenter.city ?? "Unknown city"} · {formatDateTime(order.receivedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusTone(order.status)}>
                          {statusLabel(order.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Depot Load By Service Center</CardTitle>
            <CardDescription>
              Which internal depots are carrying open bench, QC, and disposition pressure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serviceCenterLoadRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                No depot-linked internal load has been created yet.
              </div>
            ) : (
              <div className="space-y-3">
                {serviceCenterLoadRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-500">
                          {row.city ?? "Unknown city"}
                        </div>
                      </div>
                      <Badge variant="secondary">{row.openOrders} open</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        Awaiting QC: <span className="font-medium text-slate-900">{row.awaitingQc}</span>
                      </div>
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        Ready for disposition:{" "}
                        <span className="font-medium text-slate-900">
                          {row.readyForDisposition}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

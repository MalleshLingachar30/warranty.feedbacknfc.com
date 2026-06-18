import { InternalServiceStatus, Prisma } from "@prisma/client";
import {
  Boxes,
  ClipboardCheck,
  ClipboardClock,
  PackageSearch,
  ShieldCheck,
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

import { resolveServiceCenterPageContext } from "../_lib/service-center-context";

const BENCH_STATUSES: InternalServiceStatus[] = [
  "awaiting_triage",
  "under_diagnosis",
  "awaiting_parts",
  "repair_in_progress",
];
const QC_STATUSES: InternalServiceStatus[] = ["awaiting_qc", "qa_failed"];

type TechnicianLoadRow = {
  technicianId: string;
  technicianName: string;
  activeOrders: number;
  awaitingQc: number;
};

function statusLabel(status: InternalServiceStatus) {
  return status.replace(/_/g, " ");
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

export default async function DepotInternalServicesOverviewPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [
    inwardCount,
    benchQueueCount,
    awaitingQcCount,
    readyForDispositionCount,
    completedAwaitingCloseCount,
    activeOrdersCount,
    recentOrders,
    technicianLoadRows,
  ] = await Promise.all([
    db.internalServiceOrder.count({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: "inward_received",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: {
          in: BENCH_STATUSES,
        },
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: {
          in: QC_STATUSES,
        },
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: "ready_for_disposition",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: "completed",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: {
          organizationId,
        },
        status: {
          notIn: ["closed", "cancelled"],
        },
      },
    }),
    db.internalServiceOrder.findMany({
      where: {
        serviceCenter: {
          organizationId,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        priority: true,
        serviceType: true,
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
        assignedTechnician: {
          select: {
            name: true,
          },
        },
        manufacturerOrg: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.$queryRaw<TechnicianLoadRow[]>(Prisma.sql`
      SELECT
        tech.id AS "technicianId",
        tech.name AS "technicianName",
        COUNT(*) FILTER (
          WHERE iso.status IN ('awaiting_triage', 'under_diagnosis', 'awaiting_parts', 'repair_in_progress')
        )::int AS "activeOrders",
        COUNT(*) FILTER (
          WHERE iso.status IN ('awaiting_qc', 'qa_failed')
        )::int AS "awaitingQc"
      FROM internal_service_orders iso
      INNER JOIN technicians tech ON tech.id = iso.assigned_technician_id
      INNER JOIN service_centers sc ON sc.id = iso.service_center_id
      WHERE sc.organization_id = ${organizationId}::uuid
      GROUP BY tech.id, tech.name
      ORDER BY COUNT(*) DESC, tech.name ASC
      LIMIT 8
    `),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Services"
        description="Depot-facing inward receipt, bench repair, QA, and stock/disposition workspace kept separate from warranty tickets."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Awaiting Inward Triage"
          value={String(inwardCount)}
          description="Faulty items received but not yet assigned to a bench workflow."
          icon={PackageSearch}
        />
        <MetricCard
          title="Bench Queue"
          value={String(benchQueueCount)}
          description="Orders under diagnosis, waiting on parts, or currently under repair."
          icon={Wrench}
        />
        <MetricCard
          title="Awaiting QC"
          value={String(awaitingQcCount)}
          description="Units waiting for validation or cycling back after QC failure."
          icon={ClipboardCheck}
        />
        <MetricCard
          title="Ready For Disposition"
          value={String(readyForDispositionCount)}
          description="Units ready to be released, returned to stock, refurbished, or scrapped."
          icon={Boxes}
        />
        <MetricCard
          title="Completed Awaiting Close"
          value={String(completedAwaitingCloseCount)}
          description="Orders completed on the floor but not yet disposition-closed."
          icon={ShieldCheck}
        />
        <MetricCard
          title="Active Internal Orders"
          value={String(activeOrdersCount)}
          description="All open internal-service work currently owned by this depot."
          icon={ClipboardClock}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Internal Orders</CardTitle>
            <CardDescription>
              Depot and bench work isolated from customer-facing field service and warranty tickets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                No internal orders exist for this depot yet. Use Inward Receipt to start the first flow.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{order.orderNumber}</div>
                        <div className="text-xs text-slate-500">
                          {order.serviceType.replace(/_/g, " ")} · {order.priority}
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
                        <div className="font-medium text-slate-900">
                          {order.assignedTechnician?.name ?? "Unassigned"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {order.manufacturerOrg.name} · {formatDateTime(order.receivedAt)}
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
            <CardTitle>Technician / Engineer Bench Load</CardTitle>
            <CardDescription>
              Assigned internal work by technician, separated from field-service workload.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {technicianLoadRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                No engineer assignments have been made in this module yet.
              </div>
            ) : (
              <div className="space-y-3">
                {technicianLoadRows.map((row) => (
                  <div
                    key={row.technicianId}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{row.technicianName}</div>
                      <Badge variant="secondary">{row.activeOrders} active</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        Bench queue:{" "}
                        <span className="font-medium text-slate-900">{row.activeOrders}</span>
                      </div>
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        Awaiting QC:{" "}
                        <span className="font-medium text-slate-900">{row.awaitingQc}</span>
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

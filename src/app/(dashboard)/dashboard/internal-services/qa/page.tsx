import Link from "next/link";
import { InternalServiceStatus } from "@prisma/client";
import { AlertTriangle, ClipboardCheck, PackageCheck } from "lucide-react";

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
import { formatInternalServiceStatus } from "@/lib/internal-services";

import { resolveServiceCenterPageContext } from "../../_lib/service-center-context";

function statusTone(status: InternalServiceStatus) {
  switch (status) {
    case "awaiting_qc":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "qa_failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "ready_for_disposition":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
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

export default async function DepotInternalServicesQaPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [awaitingQcRows, qaFailedRows, readyRows] = await Promise.all([
    db.internalServiceOrder.findMany({
      where: {
        serviceCenter: { organizationId },
        status: "awaiting_qc",
      },
      orderBy: [{ qcStartedAt: "asc" }, { updatedAt: "asc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        qcStartedAt: true,
        assignedTechnician: { select: { name: true } },
        asset: {
          select: {
            serialNumber: true,
            publicCode: true,
            productModel: { select: { name: true, modelNumber: true } },
          },
        },
        _count: { select: { partUsages: true } },
      },
    }),
    db.internalServiceOrder.findMany({
      where: {
        serviceCenter: { organizationId },
        status: "qa_failed",
      },
      orderBy: [{ qcCompletedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        qcCompletedAt: true,
        assignedTechnician: { select: { name: true } },
        asset: {
          select: {
            serialNumber: true,
            publicCode: true,
            productModel: { select: { name: true, modelNumber: true } },
          },
        },
        _count: { select: { partUsages: true } },
      },
    }),
    db.internalServiceOrder.findMany({
      where: {
        serviceCenter: { organizationId },
        status: "ready_for_disposition",
      },
      orderBy: [{ qcCompletedAt: "asc" }, { updatedAt: "asc" }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        qcCompletedAt: true,
        assignedTechnician: { select: { name: true } },
        asset: {
          select: {
            serialNumber: true,
            publicCode: true,
            productModel: { select: { name: true, modelNumber: true } },
          },
        },
        _count: { select: { partUsages: true } },
      },
    }),
  ]);

  const qaDecisionCount = awaitingQcRows.length + qaFailedRows.length + readyRows.length;
  const qaFailRate = qaDecisionCount === 0
    ? "0.0%"
    : `${((qaFailedRows.length / qaDecisionCount) * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="QA & Calibration"
        description="Depot validation queue for repaired units before stock return, release, or scrap."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Awaiting QC"
          value={String(awaitingQcRows.length)}
          description="Units waiting for validation after repair."
          icon={ClipboardCheck}
        />
        <MetricCard
          title="QC Failed / Rework"
          value={String(qaFailedRows.length)}
          description="Orders kicked back from QA into diagnosis or repair."
          icon={AlertTriangle}
        />
        <MetricCard
          title="Ready For Disposition"
          value={String(readyRows.length)}
          description={`Current QA fail rate across the visible queue: ${qaFailRate}`}
          icon={PackageCheck}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>QA queue</CardTitle>
          <CardDescription>
            Orders in QA, failed QA, and post-QC release are separated from the bench and customer ticket modules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {qaDecisionCount === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
              No internal-service orders are currently in QA or disposition-ready status.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Part Usage</TableHead>
                  <TableHead>Queue Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...awaitingQcRows, ...qaFailedRows, ...readyRows].map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/internal-services/orders/${order.id}`}
                        className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{order.asset.productModel.name}</div>
                      <div className="text-xs text-slate-500">
                        {order.asset.productModel.modelNumber ?? "-"} ·{" "}
                        {order.asset.serialNumber ?? order.asset.publicCode}
                      </div>
                    </TableCell>
                    <TableCell>{order.assignedTechnician?.name ?? "Unassigned"}</TableCell>
                    <TableCell>
                      {order._count.partUsages}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(
                        "qcStartedAt" in order ? order.qcStartedAt : order.qcCompletedAt,
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone(order.status)}>
                        {formatInternalServiceStatus(order.status)}
                      </Badge>
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

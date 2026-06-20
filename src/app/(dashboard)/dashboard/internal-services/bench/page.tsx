import Link from "next/link";
import { InternalServiceStatus } from "@prisma/client";
import { ClipboardList, PackageSearch, Wrench, WrenchIcon } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatInternalServiceStatus, formatInternalServiceType } from "@/lib/internal-services";

import { resolveInternalServicePageContext } from "../../_lib/service-center-context";

const BENCH_STATUSES: InternalServiceStatus[] = [
  "awaiting_triage",
  "under_diagnosis",
  "awaiting_parts",
  "repair_in_progress",
];

function statusTone(status: InternalServiceStatus) {
  switch (status) {
    case "awaiting_triage":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "under_diagnosis":
    case "awaiting_parts":
    case "repair_in_progress":
      return "border-amber-200 bg-amber-50 text-amber-800";
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

function notePreview(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

export default async function DepotInternalServicesBenchPage() {
  const { organizationId } = await resolveInternalServicePageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [benchRows, awaitingTriageCount, diagnosisCount, awaitingPartsCount, repairCount] =
    await Promise.all([
      db.internalServiceOrder.findMany({
        where: {
          serviceCenter: {
            organizationId,
          },
          status: {
            in: BENCH_STATUSES,
          },
        },
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          orderNumber: true,
          status: true,
          serviceType: true,
          receivedAt: true,
          repairStartedAt: true,
          diagnosisNotes: true,
          resolutionNotes: true,
          assignedTechnician: {
            select: {
              name: true,
            },
          },
          asset: {
            select: {
              publicCode: true,
              serialNumber: true,
              productModel: {
                select: {
                  name: true,
                  modelNumber: true,
                },
              },
            },
          },
          _count: {
            select: {
              partUsages: true,
            },
          },
        },
      }),
      db.internalServiceOrder.count({
        where: {
          serviceCenter: {
            organizationId,
          },
          status: "awaiting_triage",
        },
      }),
      db.internalServiceOrder.count({
        where: {
          serviceCenter: {
            organizationId,
          },
          status: "under_diagnosis",
        },
      }),
      db.internalServiceOrder.count({
        where: {
          serviceCenter: {
            organizationId,
          },
          status: "awaiting_parts",
        },
      }),
      db.internalServiceOrder.count({
        where: {
          serviceCenter: {
            organizationId,
          },
          status: "repair_in_progress",
        },
      }),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bench Queue"
        description="Engineer-facing repair bench queue for internal service orders under triage, diagnosis, parts wait, and repair."
        actions={
          <Button asChild>
            <Link href="/dashboard/internal-services/bench/scan">
              Open Bench Scan
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Awaiting Triage"
          value={String(awaitingTriageCount)}
          description="Received units that still need their first bench action."
          icon={PackageSearch}
        />
        <MetricCard
          title="Under Diagnosis"
          value={String(diagnosisCount)}
          description="Orders actively being diagnosed by depot engineers."
          icon={ClipboardList}
        />
        <MetricCard
          title="Awaiting Parts"
          value={String(awaitingPartsCount)}
          description="Bench jobs paused until required spares become available."
          icon={WrenchIcon}
        />
        <MetricCard
          title="Repair In Progress"
          value={String(repairCount)}
          description="Orders currently consuming repair time at the bench."
          icon={Wrench}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active bench orders</CardTitle>
          <CardDescription>
            The bench queue is isolated from field jobs. Engineers work only on Internal Service Orders here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {benchRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
              No internal-service orders are currently waiting at the bench.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Bench Notes</TableHead>
                  <TableHead>Part Usage</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchRows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/internal-services/orders/${order.id}`}
                        className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {formatInternalServiceType(order.serviceType)} · {formatDateTime(order.receivedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {order.asset.productModel.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {order.asset.productModel.modelNumber ?? "-"} ·{" "}
                        {order.asset.serialNumber ?? order.asset.publicCode}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {order.assignedTechnician?.name ?? "Unassigned"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Repair started: {formatDateTime(order.repairStartedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-700">
                        {notePreview(order.diagnosisNotes ?? order.resolutionNotes)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{order._count.partUsages}</div>
                      <div className="text-xs text-slate-500">captured repair part events</div>
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

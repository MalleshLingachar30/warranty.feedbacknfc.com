import Link from "next/link";
import { Boxes, PackageCheck, ShieldCheck, Trash2 } from "lucide-react";

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
import { formatInternalServiceDisposition } from "@/lib/internal-services";

import { resolveManufacturerPageContext } from "../../_lib/server-context";

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

function statusTone(status: string) {
  switch (status) {
    case "ready_for_disposition":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "closed":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default async function ManufacturerInternalServicesDispositionPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const [
    readyForDispositionCount,
    completedAwaitingCloseCount,
    recoveredToStockCount,
    scrapOrCannibalizedCount,
    dispositionRows,
  ] = await Promise.all([
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        status: "ready_for_disposition",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        status: "completed",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        finalDisposition: {
          in: ["returned_to_stock", "refurbished_saleable"],
        },
        status: {
          in: ["completed", "closed"],
        },
      },
    }),
    db.internalServiceOrder.count({
      where: {
        manufacturerOrgId: organizationId,
        finalDisposition: {
          in: ["scrapped", "cannibalized"],
        },
        status: {
          in: ["completed", "closed"],
        },
      },
    }),
    db.internalServiceOrder.findMany({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          in: ["ready_for_disposition", "completed", "closed"],
        },
      },
      orderBy: [
        { status: "asc" },
        { qcCompletedAt: "asc" },
        { completedAt: "desc" },
        { closedAt: "desc" },
      ],
      take: 16,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        finalDisposition: true,
        isSaleableAfterService: true,
        qcCompletedAt: true,
        completedAt: true,
        closedAt: true,
        serviceCenter: {
          select: {
            name: true,
            city: true,
          },
        },
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
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disposition"
        description="Manufacturer view of QC-passed internal-service units entering stock release, refurb, return, scrap, and close-out outcomes."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Ready For Disposition"
          value={String(readyForDispositionCount)}
          description="QC-passed units waiting for the depot to choose a final outcome."
          icon={Boxes}
        />
        <MetricCard
          title="Completed Awaiting Close"
          value={String(completedAwaitingCloseCount)}
          description="Disposition recorded, but depot close-out is still pending."
          icon={ShieldCheck}
        />
        <MetricCard
          title="Recovered To Stock"
          value={String(recoveredToStockCount)}
          description="Returned-to-stock and refurbished-saleable outcomes across the network."
          icon={PackageCheck}
        />
        <MetricCard
          title="Scrap / Cannibalize"
          value={String(scrapOrCannibalizedCount)}
          description="Units exited through scrap or cannibalization outcomes."
          icon={Trash2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disposition queue and close-out history</CardTitle>
          <CardDescription>
            Manufacturer visibility into depot stock-release decisions without blending this flow into customer service tickets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dispositionRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
              No internal-service orders have reached disposition or close-out stages yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Depot</TableHead>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Disposition</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispositionRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        <Link
                          href={`/dashboard/manufacturer/internal-services/orders/${row.id}`}
                          className="hover:text-slate-700 hover:underline"
                        >
                          {row.orderNumber}
                        </Link>
                      </div>
                      <div className="text-xs text-slate-500">
                        QC completed {formatDateTime(row.qcCompletedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {row.asset.productModel.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.asset.productModel.modelNumber ?? "-"} ·{" "}
                        {row.asset.serialNumber ?? row.asset.publicCode}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.serviceCenter.name}</div>
                      <div className="text-xs text-slate-500">{row.serviceCenter.city ?? "-"}</div>
                    </TableCell>
                    <TableCell>{row.assignedTechnician?.name ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <div>{formatInternalServiceDisposition(row.finalDisposition)}</div>
                      <div className="text-xs text-slate-500">
                        Saleable: {row.isSaleableAfterService ? "Yes" : "No"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone(row.status)}>
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                      <div className="mt-1 text-xs text-slate-500">
                        Completed {formatDateTime(row.completedAt)} · Closed {formatDateTime(row.closedAt)}
                      </div>
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

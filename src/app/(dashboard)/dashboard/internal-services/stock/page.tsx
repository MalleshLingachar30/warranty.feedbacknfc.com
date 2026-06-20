import { Boxes, PackageCheck, ShieldCheck, Trash2 } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StockReleaseQueueClient } from "@/components/internal-services/stock-release-queue-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";

import { resolveInternalServicePageContext } from "../../_lib/service-center-context";

interface DepotInternalServicesStockPageProps {
  searchParams: Promise<{ updated?: string | string[]; error?: string | string[] }>;
}

function firstQueryValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? value[0] ?? null : null;
}

function formatActionNotice(action: string | null) {
  switch (action) {
    case "complete_disposition":
      return "Final disposition recorded from the stock-release queue.";
    case "close_order":
      return "Internal-service order closed from the stock-release queue.";
    default:
      return null;
  }
}

export default async function DepotInternalServicesStockPage({
  searchParams,
}: DepotInternalServicesStockPageProps) {
  const { organizationId } = await resolveInternalServicePageContext();
  const query = await searchParams;

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const updated = firstQueryValue(query.updated);
  const error = firstQueryValue(query.error);

  const [
    readyForDispositionCount,
    completedAwaitingCloseCount,
    returnedToStockCount,
    scrapOrCannibalizedCount,
    queueRows,
  ] = await Promise.all([
    db.internalServiceOrder.count({
      where: {
        serviceCenter: { organizationId },
        status: "ready_for_disposition",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: { organizationId },
        status: "completed",
      },
    }),
    db.internalServiceOrder.count({
      where: {
        serviceCenter: { organizationId },
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
        serviceCenter: { organizationId },
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
        serviceCenter: { organizationId },
        status: {
          in: ["ready_for_disposition", "completed"],
        },
      },
      orderBy: [
        { status: "asc" },
        { qcCompletedAt: "asc" },
        { completedAt: "asc" },
        { receivedAt: "asc" },
      ],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        finalDisposition: true,
        qcCompletedAt: true,
        completedAt: true,
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

  const readyRows = queueRows.filter((row) => row.status === "ready_for_disposition");
  const completedRows = queueRows.filter((row) => row.status === "completed");
  const successNotice = formatActionNotice(updated);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Release"
        description="Disposition and close-out queue for internal-service orders after QA completion."
      />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {successNotice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successNotice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Ready For Disposition"
          value={String(readyForDispositionCount)}
          description="QC-passed units waiting for stock, return, refurb, or scrap outcome."
          icon={Boxes}
        />
        <MetricCard
          title="Completed Awaiting Close"
          value={String(completedAwaitingCloseCount)}
          description="Orders whose disposition is recorded but still need formal closure."
          icon={ShieldCheck}
        />
        <MetricCard
          title="Recovered To Stock"
          value={String(returnedToStockCount)}
          description="Returned-to-stock or refurbished-saleable outcomes already recorded."
          icon={PackageCheck}
        />
        <MetricCard
          title="Scrap / Cannibalize"
          value={String(scrapOrCannibalizedCount)}
          description="Units exited from saleable recovery into scrap or cannibalization outcomes."
          icon={Trash2}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ready For Disposition</CardTitle>
            <CardDescription>
              Decide whether the repaired unit returns to stock, becomes refurbished saleable stock, or exits via return / scrap outcome.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readyRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                No QC-passed internal-service orders are waiting for disposition right now.
              </div>
            ) : (
              <StockReleaseQueueClient
                rows={readyRows.map((row) => ({
                  id: row.id,
                  orderNumber: row.orderNumber,
                  status: row.status,
                  finalDisposition: row.finalDisposition,
                  modelName: row.asset.productModel.name,
                  modelNumber: row.asset.productModel.modelNumber,
                  assetPublicCode: row.asset.publicCode,
                  assetSerialNumber: row.asset.serialNumber,
                  assignedTechnicianName: row.assignedTechnician?.name ?? null,
                  qcCompletedAt: row.qcCompletedAt?.toISOString() ?? null,
                  completedAt: row.completedAt?.toISOString() ?? null,
                }))}
                actionPathBase="/dashboard/internal-services/orders"
                returnTo="/dashboard/internal-services/stock"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Completed Awaiting Close</CardTitle>
            <CardDescription>
              Orders whose disposition is already recorded and now only need close-out confirmation from the stock-release queue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {completedRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
                No completed internal-service orders are waiting to be closed.
              </div>
            ) : (
              <StockReleaseQueueClient
                rows={completedRows.map((row) => ({
                  id: row.id,
                  orderNumber: row.orderNumber,
                  status: row.status,
                  finalDisposition: row.finalDisposition,
                  modelName: row.asset.productModel.name,
                  modelNumber: row.asset.productModel.modelNumber,
                  assetPublicCode: row.asset.publicCode,
                  assetSerialNumber: row.asset.serialNumber,
                  assignedTechnicianName: row.assignedTechnician?.name ?? null,
                  qcCompletedAt: row.qcCompletedAt?.toISOString() ?? null,
                  completedAt: row.completedAt?.toISOString() ?? null,
                }))}
                actionPathBase="/dashboard/internal-services/orders"
                returnTo="/dashboard/internal-services/stock"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

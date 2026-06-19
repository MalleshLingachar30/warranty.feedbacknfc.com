"use client";

import Link from "next/link";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StockReleaseRow = {
  id: string;
  orderNumber: string;
  status: string;
  finalDisposition: string | null;
  modelName: string;
  modelNumber: string | null;
  assetPublicCode: string;
  assetSerialNumber: string | null;
  assignedTechnicianName: string | null;
  qcCompletedAt: string | null;
  completedAt: string | null;
};

const DISPOSITION_OPTIONS = [
  "returned_to_customer",
  "returned_to_distributor",
  "returned_to_service_center",
  "refurbished_saleable",
  "returned_to_stock",
  "scrapped",
  "cannibalized",
  "no_fault_found_return",
] as const;

function formatDisposition(value: string) {
  return value.replace(/_/g, " ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StockReleaseQueueClient({
  rows,
  actionPathBase,
  returnTo,
}: {
  rows: StockReleaseRow[];
  actionPathBase: string;
  returnTo: string;
}) {
  const [selectedDispositionById, setSelectedDispositionById] = useState<Record<string, string>>(
    Object.fromEntries(
      rows.map((row) => [
        row.id,
        row.finalDisposition ?? "returned_to_stock",
      ]),
    ),
  );

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const selectedDisposition =
          selectedDispositionById[row.id] ?? row.finalDisposition ?? "returned_to_stock";
        const actionBase = `${actionPathBase}/${row.id}/action`;
        const completeHref = `${actionBase}?action=complete_disposition&finalDisposition=${encodeURIComponent(selectedDisposition)}&returnTo=${encodeURIComponent(returnTo)}`;
        const closeHref = `${actionBase}?action=close_order&returnTo=${encodeURIComponent(returnTo)}`;

        return (
          <div
            key={row.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.orderNumber}</p>
                  <p className="text-xs text-slate-500">
                    {row.modelName}
                    {row.modelNumber ? ` · ${row.modelNumber}` : ""} ·{" "}
                    {row.assetSerialNumber ?? row.assetPublicCode}
                  </p>
                </div>
                <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                  <p>Assigned engineer: {row.assignedTechnicianName ?? "Unassigned"}</p>
                  <p>QC completed: {formatDateTime(row.qcCompletedAt)}</p>
                  <p>Completed: {formatDateTime(row.completedAt)}</p>
                  <p>Status: {row.status.replace(/_/g, " ")}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:min-w-[22rem]">
                {row.status === "ready_for_disposition" ? (
                  <>
                    <select
                      value={selectedDisposition}
                      onChange={(event) =>
                        setSelectedDispositionById((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      {DISPOSITION_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {formatDisposition(option)}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={completeHref}
                        className={cn(buttonVariants({ variant: "default" }))}
                      >
                        Complete Disposition
                      </a>
                      <Link
                        href={`${actionPathBase}/${row.id}`}
                        className={cn(buttonVariants({ variant: "outline" }))}
                      >
                        Open Order
                      </Link>
                    </div>
                  </>
                ) : row.status === "completed" ? (
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={closeHref}
                      className={cn(buttonVariants({ variant: "default" }))}
                    >
                      Close Order
                    </a>
                    <Link
                      href={`${actionPathBase}/${row.id}`}
                      className={cn(buttonVariants({ variant: "outline" }))}
                    >
                      Open Order
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={`${actionPathBase}/${row.id}`}
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    Open Order
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

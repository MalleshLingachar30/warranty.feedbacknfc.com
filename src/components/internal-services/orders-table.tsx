import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatInternalServicePriority,
  formatInternalServiceStatus,
  formatInternalServiceType,
} from "@/lib/internal-services";

import type { InternalServiceOrderListItem } from "./types";

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

function statusTone(status: string) {
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

export function InternalServiceOrdersTable({
  orders,
  orderBaseHref,
  showManufacturer = false,
}: {
  orders: InternalServiceOrderListItem[];
  orderBaseHref: string;
  showManufacturer?: boolean;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
        No internal service orders have been created in this module yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Asset</TableHead>
          <TableHead>Service center</TableHead>
          {showManufacturer ? <TableHead>Manufacturer</TableHead> : null}
          <TableHead>Assigned</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <Link
                href={`${orderBaseHref}/${order.id}`}
                className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
              >
                {order.orderNumber}
              </Link>
              <div className="text-xs text-slate-500">
                {formatInternalServiceType(order.serviceType)} ·{" "}
                {formatInternalServicePriority(order.priority)}
              </div>
            </TableCell>
            <TableCell>
              <div className="font-medium text-slate-900">{order.modelName}</div>
              <div className="text-xs text-slate-500">
                {order.modelNumber ?? "No model"} ·{" "}
                {order.assetSerialNumber ?? order.assetPublicCode}
              </div>
            </TableCell>
            <TableCell>
              <div className="font-medium text-slate-900">{order.serviceCenterName}</div>
              <div className="text-xs text-slate-500">
                {order.serviceCenterCity ?? "Unknown city"} · {formatDateTime(order.receivedAt)}
              </div>
            </TableCell>
            {showManufacturer ? (
              <TableCell>
                <div className="font-medium text-slate-900">{order.manufacturerName}</div>
              </TableCell>
            ) : null}
            <TableCell>
              <div className="font-medium text-slate-900">
                {order.assignedTechnicianName ?? "Unassigned"}
              </div>
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
  );
}

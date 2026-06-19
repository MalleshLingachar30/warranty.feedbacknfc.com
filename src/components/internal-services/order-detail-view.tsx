import Link from "next/link";

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
  formatInternalServiceControlTagSource,
  formatInternalServiceDisposition,
  formatInternalServicePriority,
  formatInternalServiceStatus,
  formatInternalServiceType,
} from "@/lib/internal-services";

import type { InternalServiceOrderDetail } from "./types";

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

export function InternalServiceOrderDetailView({
  order,
  backHref,
  backLabel,
}: {
  order: InternalServiceOrderDetail;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={order.orderNumber}
        description="Internal depot/service order kept separate from customer warranty tickets."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge variant="outline" className={statusTone(order.status)}>
              {formatInternalServiceStatus(order.status)}
            </Badge>
            <Button size="sm" variant="outline" asChild>
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asset context</CardTitle>
            <CardDescription>
              Serialized identity and ownership context for this internal flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>
              Product: {order.modelName}
              {order.modelNumber ? ` · ${order.modelNumber}` : ""}
            </p>
            <p>Asset code: {order.assetPublicCode}</p>
            <p>Serial: {order.assetSerialNumber ?? "-"}</p>
            <p>Manufacturer: {order.manufacturerName}</p>
            <p>Service center / depot: {order.serviceCenterName}</p>
            <p>City: {order.serviceCenterCity ?? "-"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operational context</CardTitle>
            <CardDescription>
              How this order entered internal services and who owns it now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>Service type: {formatInternalServiceType(order.serviceType)}</p>
            <p>Priority: {formatInternalServicePriority(order.priority)}</p>
            <p>Initiation source: {order.initiationSource.replace(/_/g, " ")}</p>
            <p>
              Sticker-led control: {order.controllingTagReady ? "ready" : "pending"}
            </p>
            <p>Controlling tag: {order.controllingTagCode ?? "-"}</p>
            <p>
              Control source:{" "}
              {formatInternalServiceControlTagSource(order.controllingTagSource)}
            </p>
            <p>
              Control resolved at: {formatDateTime(order.controllingTagResolvedAt)}
            </p>
            <p>Assigned engineer: {order.assignedTechnicianName ?? "Unassigned"}</p>
            <p>Requested by: {order.requestedByName ?? "-"}</p>
            <p>Received by: {order.receivedByName ?? "-"}</p>
            <p>Disposition: {formatInternalServiceDisposition(order.finalDisposition)}</p>
            <p>Saleable after service: {order.isSaleableAfterService ? "Yes" : "No"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Service notes</CardTitle>
            <CardDescription>
              Internal diagnosis and repair notes without customer-facing language.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-700">
            <div>
              <p className="font-medium text-slate-900">Reported fault</p>
              <p>{order.reportedFault ?? "-"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">Inward condition notes</p>
              <p>{order.inwardConditionNotes ?? "-"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">Diagnosis notes</p>
              <p>{order.diagnosisNotes ?? "-"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">Resolution notes</p>
              <p>{order.resolutionNotes ?? "-"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">Accessories received</p>
              {order.accessoriesReceived.length === 0 ? (
                <p>-</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {order.accessoriesReceived.map((item) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lifecycle timestamps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>Received: {formatDateTime(order.receivedAt)}</p>
            <p>Triaged: {formatDateTime(order.triagedAt)}</p>
            <p>Repair started: {formatDateTime(order.repairStartedAt)}</p>
            <p>QC started: {formatDateTime(order.qcStartedAt)}</p>
            <p>QC completed: {formatDateTime(order.qcCompletedAt)}</p>
            <p>Completed: {formatDateTime(order.completedAt)}</p>
            <p>Closed: {formatDateTime(order.closedAt)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
            <CardDescription>
              System and operator events recorded for this internal-service order.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.timelineEntries.length === 0 ? (
              <p className="text-sm text-slate-500">No timeline events recorded yet.</p>
            ) : (
              order.timelineEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {entry.eventType.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                  </div>
                  <p className="mt-1">{entry.eventDescription ?? "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {entry.actorName ?? "System"}
                    {entry.actorRole ? ` · ${entry.actorRole.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Part usage</CardTitle>
            <CardDescription>
              Traced internal-service part movements linked directly to this order.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.partUsages.length === 0 ? (
              <p className="text-sm text-slate-500">
                No internal-service part usage has been linked yet.
              </p>
            ) : (
              order.partUsages.map((usage) => (
                <div
                  key={usage.id}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <p className="font-medium text-slate-900">
                    {usage.usageType.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1">
                    {usage.partName ?? "Unnamed part"}
                    {usage.partNumber ? ` · ${usage.partNumber}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Asset: {usage.usedAssetCode ?? "-"} · Tag: {usage.usedTagCode ?? "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Tracking: {usage.traced ? "traced asset / tag" : "manual repair entry"}
                  </p>
                  {usage.note ? (
                    <p className="mt-1 text-xs text-slate-600">{usage.note}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    Linked at {formatDateTime(usage.linkedAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

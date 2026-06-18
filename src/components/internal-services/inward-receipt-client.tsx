"use client";

import { useMemo, useState } from "react";
import { ArrowRightCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AssetSuggestion = {
  publicCode: string;
  serialNumber: string | null;
  modelName: string;
  modelNumber: string | null;
  organizationName: string | null;
};

type ServiceCenterOption = {
  id: string;
  name: string;
  city: string | null;
  organizationName: string | null;
};

type InwardReceiptClientProps = {
  submitUrl: string;
  orderBaseHref: string;
  serviceCenters: ServiceCenterOption[];
  assetSuggestions: AssetSuggestion[];
  defaultServiceCenterId?: string | null;
  serviceCenterLocked?: boolean;
  organizationContextLabel: string;
};

type CreatedOrderState = {
  id: string;
  orderNumber: string;
  href: string;
};

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function InwardReceiptClient({
  submitUrl,
  orderBaseHref,
  serviceCenters,
  assetSuggestions,
  defaultServiceCenterId = null,
  serviceCenterLocked = false,
  organizationContextLabel,
}: InwardReceiptClientProps) {
  const [assetReference, setAssetReference] = useState("");
  const [serviceCenterId, setServiceCenterId] = useState(defaultServiceCenterId ?? "");
  const [initiationSource, setInitiationSource] = useState("manual_admin");
  const [serviceType, setServiceType] = useState("depot_repair");
  const [priority, setPriority] = useState("medium");
  const [reportedFault, setReportedFault] = useState("");
  const [inwardConditionNotes, setInwardConditionNotes] = useState("");
  const [accessoriesReceived, setAccessoriesReceived] = useState("");
  const [submissionState, setSubmissionState] = useState<"idle" | "creating" | "created">("idle");
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recentAssetButtons = useMemo(() => assetSuggestions.slice(0, 6), [assetSuggestions]);
  const isBusy = submissionState !== "idle";

  const createOrder = async () => {
    if (!assetReference.trim()) {
      setError("Asset code, serial number, or tag code is required.");
      return;
    }

    if (!serviceCenterId.trim()) {
      setError("Select the depot or service center that will own this internal order.");
      return;
    }

    setSubmissionState("creating");
    setCreatedOrder(null);
    setError(null);
    const toastId = toast.loading("Creating internal-service order…");

    try {
      const response = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetReference,
          serviceCenterId,
          initiationSource,
          serviceType,
          priority,
          reportedFault,
          inwardConditionNotes,
          accessoriesReceived: accessoriesReceived
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        order?: { id: string; orderNumber: string };
      };

      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Unable to create internal service order.");
      }

      const nextHref = `${orderBaseHref}/${payload.order.id}`;
      const nextOrder = {
        id: payload.order.id,
        orderNumber: payload.order.orderNumber,
        href: nextHref,
      } satisfies CreatedOrderState;
      setCreatedOrder(nextOrder);
      setSubmissionState("created");
      toast.success(`${payload.order.orderNumber} created. Opening depot order…`, {
        id: toastId,
      });

      // Paint the success state first so the operator never gets stranded without
      // a visible completion signal, then hard-navigate to the new order detail.
      window.setTimeout(() => {
        window.location.assign(nextHref);
      }, 150);
    } catch (requestError) {
      setSubmissionState("idle");
      setCreatedOrder(null);
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create internal service order.",
        { id: toastId },
      );
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create internal service order.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm text-indigo-900">
        <p className="font-medium">Internal Services intake for {organizationContextLabel}</p>
        <p className="mt-1 text-indigo-800/90">
          This creates a depot/internal order only. It does not open a warranty ticket or customer confirmation flow.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Asset code, serial, or tag code
            </label>
            <Input
              value={assetReference}
              onChange={(event) => setAssetReference(event.target.value)}
              placeholder="Scan or type AST-..., serial number, or TAG-..."
              disabled={isBusy}
            />
            <p className="text-xs text-slate-500">
              Use the existing traceability identity. Do not create a new customer-facing ticket here.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Owning depot / service center
              </label>
              <select
                value={serviceCenterId}
                onChange={(event) => setServiceCenterId(event.target.value)}
                className={fieldClassName}
                disabled={serviceCenterLocked || isBusy}
              >
                <option value="">Select owning depot</option>
                {serviceCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                    {center.city ? ` · ${center.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Initiation source
              </label>
              <select
                value={initiationSource}
                onChange={(event) => setInitiationSource(event.target.value)}
                className={fieldClassName}
                disabled={isBusy}
              >
                <option value="manual_admin">Manual admin</option>
                <option value="customer_return">Customer return</option>
                <option value="distributor_return">Distributor return</option>
                <option value="service_center_return">Service-center return</option>
                <option value="production_rejection">Production rejection</option>
                <option value="demo_return">Demo return</option>
                <option value="internal_qc">Internal QC</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Service type</label>
              <select
                value={serviceType}
                onChange={(event) => setServiceType(event.target.value)}
                className={fieldClassName}
                disabled={isBusy}
              >
                <option value="depot_repair">Depot repair</option>
                <option value="preventive_maintenance">Preventive maintenance</option>
                <option value="calibration">Calibration</option>
                <option value="refurbishment">Refurbishment</option>
                <option value="qa_inspection">QA inspection</option>
                <option value="demo_preparation">Demo preparation</option>
                <option value="field_campaign">Field campaign</option>
                <option value="distributor_rework">Distributor rework</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Priority</label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className={fieldClassName}
                disabled={isBusy}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">Reported fault</label>
            <Textarea
              value={reportedFault}
              onChange={(event) => setReportedFault(event.target.value)}
              placeholder="Describe the incoming problem, failure mode, or return reason."
              rows={4}
              disabled={isBusy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Inward condition notes
            </label>
            <Textarea
              value={inwardConditionNotes}
              onChange={(event) => setInwardConditionNotes(event.target.value)}
              placeholder="Physical condition, missing parts, damage, packaging state, or intake observations."
              rows={4}
              disabled={isBusy}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Accessories received
            </label>
            <Input
              value={accessoriesReceived}
              onChange={(event) => setAccessoriesReceived(event.target.value)}
              placeholder="Power cable, sensor, probe, bracket"
              disabled={isBusy}
            />
            <p className="text-xs text-slate-500">
              Comma-separated. These will be stored on the internal order as inward context.
            </p>
          </div>

          {error ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {submissionState === "created" && createdOrder ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p className="font-medium">
                {createdOrder.orderNumber} has been created successfully.
              </p>
              <p className="mt-1">
                Opening the depot order now. If the browser does not redirect
                automatically, open it directly:
              </p>
              <a
                href={createdOrder.href}
                className="mt-2 inline-flex text-sm font-medium text-emerald-900 underline underline-offset-2"
              >
                Open {createdOrder.orderNumber}
              </a>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={createOrder} disabled={isBusy}>
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightCircle className="size-4" />}
              {submissionState === "creating"
                ? "Creating Internal Service Order…"
                : submissionState === "created"
                  ? `Opening ${createdOrder?.orderNumber ?? "Depot Order"}…`
                  : "Create Internal Service Order"}
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent traceable assets</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use these to seed inward receipt quickly when the faulty item is already labeled.
            </p>
          </div>
          <div className="space-y-3">
            {recentAssetButtons.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                No recent serialized assets are available for quick selection yet.
              </div>
            ) : (
              recentAssetButtons.map((asset) => (
                <button
                  key={`${asset.publicCode}-${asset.serialNumber ?? "none"}`}
                  type="button"
                  onClick={() => setAssetReference(asset.serialNumber ?? asset.publicCode)}
                  disabled={isBusy}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <div className="font-medium text-slate-900">{asset.modelName}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {asset.modelNumber ?? "No model"} · {asset.serialNumber ?? asset.publicCode}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {asset.organizationName ?? "Unknown manufacturer"} · {asset.publicCode}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

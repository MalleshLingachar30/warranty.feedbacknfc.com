"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightCircle,
  Loader2,
  ScanLine,
  ShieldCheck,
  Sticker,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  scanUrl: string;
  affixUrl: string;
  orderBaseHref: string;
  prefillBaseHref: string;
  serviceCenters: ServiceCenterOption[];
  assetSuggestions: AssetSuggestion[];
  defaultServiceCenterId?: string | null;
  defaultAssetReference?: string | null;
  serviceCenterLocked?: boolean;
  organizationContextLabel: string;
};

type CreatedOrderState = {
  id: string;
  orderNumber: string;
  href: string;
};

type ScanPayload = {
  asset: {
    id: string;
    publicCode: string;
    serialNumber: string | null;
    organizationId: string;
    lifecycleState: string;
    productModel: {
      id: string;
      name: string;
      modelNumber: string | null;
    };
  } | null;
  matchedTag: {
    id: string;
    publicCode: string;
    tagClass: string;
    status: string;
    viewerPolicy: string;
    symbology: string;
  } | null;
  controllingTag: {
    id: string;
    publicCode: string;
    tagClass: string;
    status: string;
    viewerPolicy: string;
    symbology: string;
  } | null;
  activeOrder: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  latestClosedOrder: {
    id: string;
    orderNumber: string;
    status: string;
    closedAt: string | null;
  } | null;
  referenceSource: "tag" | "asset_code" | "serial" | "unknown";
  controllingTagSource: string;
  controllingTagResolvedAt: string | null;
  controllingTagReady: boolean;
  recommendedAction:
    | "resume_active_order"
    | "view_latest_closed_order"
    | "start_inward_with_existing_tag"
    | "affix_new_internal_service_label"
    | "manual_asset_lookup_and_affix_label";
};

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function formatScanAction(value: string) {
  return value.replace(/_/g, " ");
}

function formatTagSource(value: string) {
  return value.replace(/_/g, " ");
}

export function InwardReceiptClient({
  submitUrl,
  scanUrl,
  affixUrl,
  orderBaseHref,
  prefillBaseHref,
  serviceCenters,
  assetSuggestions,
  defaultServiceCenterId = null,
  defaultAssetReference = null,
  serviceCenterLocked = false,
  organizationContextLabel,
}: InwardReceiptClientProps) {
  const [assetReference, setAssetReference] = useState(defaultAssetReference ?? "");
  const [serviceCenterId, setServiceCenterId] = useState(defaultServiceCenterId ?? "");
  const [initiationSource, setInitiationSource] = useState("manual_admin");
  const [serviceType, setServiceType] = useState("depot_repair");
  const [priority, setPriority] = useState("medium");
  const [reportedFault, setReportedFault] = useState("");
  const [inwardConditionNotes, setInwardConditionNotes] = useState("");
  const [accessoriesReceived, setAccessoriesReceived] = useState("");
  const [scanState, setScanState] = useState<"idle" | "resolving" | "resolved" | "affixing">(
    "idle",
  );
  const [scanContext, setScanContext] = useState<ScanPayload | null>(null);
  const [submissionState, setSubmissionState] = useState<"idle" | "creating" | "created">("idle");
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoResolveSeed, setAutoResolveSeed] = useState<string | null>(null);

  const recentAssetButtons = useMemo(() => assetSuggestions.slice(0, 6), [assetSuggestions]);
  const isBusy = submissionState !== "idle" || scanState === "resolving" || scanState === "affixing";
  const identityLocked = Boolean(scanContext?.asset);
  const readyForInward =
    Boolean(scanContext?.asset) &&
    !scanContext?.activeOrder &&
    Boolean(scanContext?.controllingTagReady);

  useEffect(() => {
    setAssetReference(defaultAssetReference ?? "");
    setScanContext(null);
    setAutoResolveSeed(defaultAssetReference ?? null);
    setError(null);
  }, [defaultAssetReference]);

  useEffect(() => {
    if (!autoResolveSeed || autoResolveSeed !== assetReference.trim()) {
      return;
    }

    const seededReference = autoResolveSeed;
    let cancelled = false;

    async function autoResolve() {
      setScanState("resolving");
      setError(null);

      try {
        const response = await fetch(
          `${scanUrl}?code=${encodeURIComponent(seededReference)}`,
        );
        const payload = (await response.json()) as {
          error?: string;
          scan?: ScanPayload;
        };

        if (!response.ok || !payload.scan) {
          throw new Error(payload.error ?? "Unable to resolve internal-service identity.");
        }

        if (cancelled) {
          return;
        }

        setScanContext(payload.scan);
        setScanState("resolved");
      } catch (resolveError) {
        if (cancelled) {
          return;
        }

        setScanContext(null);
        setScanState("idle");
        setError(
          resolveError instanceof Error
            ? resolveError.message
            : "Unable to resolve internal-service identity.",
        );
      } finally {
        if (!cancelled) {
          setAutoResolveSeed(null);
        }
      }
    }

    void autoResolve();

    return () => {
      cancelled = true;
    };
  }, [assetReference, autoResolveSeed, scanUrl]);

  const clearIdentity = () => {
    setAssetReference("");
    setScanContext(null);
    setScanState("idle");
    setCreatedOrder(null);
    setSubmissionState("idle");
    setError(null);
    setAutoResolveSeed(null);
  };

  const resolveIdentity = async () => {
    const trimmedReference = assetReference.trim();

    if (!trimmedReference) {
      setError("Scan or type an asset code, serial number, or tag code first.");
      return;
    }

    setScanState("resolving");
    setScanContext(null);
    setCreatedOrder(null);
    setSubmissionState("idle");
    setError(null);

    try {
      const response = await fetch(
        `${scanUrl}?code=${encodeURIComponent(trimmedReference)}`,
      );
      const payload = (await response.json()) as {
        error?: string;
        scan?: ScanPayload;
      };

      if (!response.ok || !payload.scan) {
        throw new Error(payload.error ?? "Unable to resolve internal-service identity.");
      }

      setScanContext(payload.scan);
      setScanState("resolved");

      if (payload.scan.activeOrder) {
        toast.info(
          `${payload.scan.activeOrder.orderNumber} is already active for this sticker identity.`,
        );
        return;
      }

      if (payload.scan.controllingTagReady) {
        toast.success("Internal-service sticker identity resolved.");
        return;
      }

      toast.info("Identity resolved, but a depot label still needs to be affixed.");
    } catch (resolveError) {
      setScanState("idle");
      setScanContext(null);
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Unable to resolve internal-service identity.",
      );
    }
  };

  const affixLabel = async () => {
    if (!scanContext?.asset?.id) {
      setError("Resolve a serialized asset first before affixing a depot label.");
      return;
    }

    setScanState("affixing");
    setError(null);
    const toastId = toast.loading("Generating internal-service label…");

    try {
      const response = await fetch(affixUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetId: scanContext.asset.id,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        controllingTag?: {
          id: string;
          publicCode: string;
          tagClass: string;
          status: string;
          viewerPolicy: string;
          symbology: string;
        };
      };

      if (!response.ok || !payload.controllingTag) {
        throw new Error(payload.error ?? "Unable to affix internal-service label.");
      }

      const nextTag = payload.controllingTag;
      setScanContext((current) =>
        current
          ? {
              ...current,
              controllingTag: nextTag,
              matchedTag: current.matchedTag ?? nextTag,
              controllingTagSource: "new_affixed_label",
              controllingTagResolvedAt: new Date().toISOString(),
              controllingTagReady: true,
              recommendedAction: current.activeOrder
                ? "resume_active_order"
                : "start_inward_with_existing_tag",
            }
          : current,
      );
      setAssetReference(nextTag.publicCode);
      setScanState("resolved");
      toast.success(`Label ${nextTag.publicCode} is ready to affix on the unit.`, {
        id: toastId,
      });
    } catch (affixError) {
      setScanState("resolved");
      toast.error(
        affixError instanceof Error
          ? affixError.message
          : "Unable to affix internal-service label.",
        { id: toastId },
      );
      setError(
        affixError instanceof Error
          ? affixError.message
          : "Unable to affix internal-service label.",
      );
    }
  };

  const createOrder = async () => {
    if (!scanContext?.asset) {
      setError("Resolve the sticker identity before creating an inward order.");
      return;
    }

    if (scanContext.activeOrder) {
      setError(
        `${scanContext.activeOrder.orderNumber} is already active for this sticker identity. Open that order instead of creating a duplicate inward.`,
      );
      return;
    }

    if (!scanContext.controllingTagReady) {
      setError("Affix or verify the controlling internal-service label before inward receipt.");
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
          assetReference: scanContext.controllingTag?.publicCode ?? assetReference.trim(),
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
      <Card className="border-indigo-200 bg-indigo-50 text-indigo-950">
        <CardHeader>
          <CardTitle>Sticker-led inward receipt for {organizationContextLabel}</CardTitle>
          <CardDescription className="text-indigo-900/80">
            Resolve or affix the controlling internal-service label first. Only then create the depot inward order.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanLine className="size-4" />
                Scan or Affix Internal Service Label
              </CardTitle>
              <CardDescription>
                Primary path: scan the current sticker identity. Secondary path: type a known serial or asset code, resolve it, and affix a depot label if one does not already exist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={assetReference}
                  onChange={(event) => setAssetReference(event.target.value)}
                  placeholder="Scan TAG-..., AST-..., or serial number"
                  disabled={identityLocked || isBusy}
                />
                <div className="flex gap-2">
                  <Button onClick={resolveIdentity} disabled={isBusy || identityLocked}>
                    {scanState === "resolving" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ScanLine className="size-4" />
                    )}
                    Resolve Identity
                  </Button>
                  <Button
                    variant="outline"
                    onClick={clearIdentity}
                    disabled={isBusy}
                  >
                    <Undo2 className="size-4" />
                    Clear
                  </Button>
                </div>
              </div>

              {scanContext ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      Ref: {formatScanAction(scanContext.referenceSource)}
                    </Badge>
                    <Badge variant={scanContext.controllingTagReady ? "default" : "outline"}>
                      {scanContext.controllingTagReady ? "Sticker Ready" : "Sticker Pending"}
                    </Badge>
                    <Badge variant="outline">
                      Next: {formatScanAction(scanContext.recommendedAction)}
                    </Badge>
                  </div>

                  {scanContext.asset ? (
                    <div className="mt-3 space-y-1 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">
                        {scanContext.asset.productModel.name}
                        {scanContext.asset.productModel.modelNumber
                          ? ` · ${scanContext.asset.productModel.modelNumber}`
                          : ""}
                      </p>
                      <p>
                        Asset: {scanContext.asset.publicCode}
                        {scanContext.asset.serialNumber
                          ? ` · Serial: ${scanContext.asset.serialNumber}`
                          : ""}
                      </p>
                      <p>
                        Controlling tag: {scanContext.controllingTag?.publicCode ?? "-"}
                        {scanContext.controllingTag
                          ? ` · Source: ${formatTagSource(scanContext.controllingTagSource)}`
                          : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-amber-800">
                      No known serialized asset was resolved. Use a valid asset code or serial first, then affix the depot label.
                    </p>
                  )}

                  {scanContext.activeOrder ? (
                    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">
                        {scanContext.activeOrder.orderNumber} is already active for this sticker identity.
                      </p>
                      <p className="mt-1">
                        Duplicate inward creation is blocked. Resume the active depot order instead.
                      </p>
                      <Link
                        href={`${orderBaseHref}/${scanContext.activeOrder.id}`}
                        className="mt-2 inline-flex font-medium underline underline-offset-2"
                      >
                        Open {scanContext.activeOrder.orderNumber}
                      </Link>
                    </div>
                  ) : null}

                  {!scanContext.activeOrder && scanContext.latestClosedOrder ? (
                    <div className="mt-4 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">
                        Previous closed order: {scanContext.latestClosedOrder.orderNumber}
                      </p>
                      <p className="mt-1">
                        This unit has prior internal-service history. You can review it or continue with a fresh inward order below.
                      </p>
                      <Link
                        href={`${orderBaseHref}/${scanContext.latestClosedOrder.id}`}
                        className="mt-2 inline-flex font-medium underline underline-offset-2"
                      >
                        View latest closed order
                      </Link>
                    </div>
                  ) : null}

                  {!scanContext.activeOrder && !scanContext.controllingTagReady && scanContext.asset ? (
                    <div className="mt-4 rounded-lg border border-indigo-300 bg-indigo-50 p-3 text-sm text-indigo-900">
                      <p className="font-medium">
                        This asset does not yet have a trusted controlling depot label.
                      </p>
                      <p className="mt-1">
                        Generate a label record now, affix it physically on the unit, then proceed with inward receipt.
                      </p>
                      <Button className="mt-3" onClick={affixLabel} disabled={isBusy}>
                        {scanState === "affixing" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sticker className="size-4" />
                        )}
                        Affix Internal Service Label
                      </Button>
                    </div>
                  ) : null}

                  {readyForInward ? (
                    <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                      <div className="flex items-center gap-2 font-medium">
                        <ShieldCheck className="size-4" />
                        Sticker identity is verified and ready for inward receipt.
                      </div>
                      <p className="mt-1">
                        Continue with depot ownership, fault notes, and inward condition details below.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  Resolve a sticker, asset code, or serial here before creating the inward order.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inward Receipt</CardTitle>
              <CardDescription>
                Secondary step after sticker resolution. This creates the internal depot order only after the controlling label is ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Button onClick={createOrder} disabled={isBusy || !readyForInward}>
                  {isBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRightCircle className="size-4" />
                  )}
                  {submissionState === "creating"
                    ? "Creating Internal Service Order…"
                    : submissionState === "created"
                      ? `Opening ${createdOrder?.orderNumber ?? "Depot Order"}…`
                      : "Create Internal Service Order"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent traceable assets</CardTitle>
            <CardDescription>
              Quick-entry shortcuts for already serialized units. These reopen the same inward page with the selected identity prefilled and auto-resolved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAssetButtons.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                No recent serialized assets are available for quick selection yet.
              </div>
            ) : (
              recentAssetButtons.map((asset) => (
                <Link
                  key={`${asset.publicCode}-${asset.serialNumber ?? "none"}`}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                  href={`${prefillBaseHref}?asset=${encodeURIComponent(
                    asset.serialNumber ?? asset.publicCode,
                  )}`}
                >
                  <div className="font-medium text-slate-900">{asset.modelName}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {asset.modelNumber ?? "No model"} · {asset.serialNumber ?? asset.publicCode}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {asset.organizationName ?? "Unknown manufacturer"} · {asset.publicCode}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

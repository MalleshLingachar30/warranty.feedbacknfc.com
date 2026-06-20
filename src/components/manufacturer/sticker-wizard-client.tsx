"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, PackagePlusIcon } from "lucide-react";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ASSET_PRODUCT_CLASSES,
  TAG_OUTPUT_FORMATS,
  formatProductClassLabel,
  formatTagOutputFormatLabel,
  formatSymbologyLabel,
  recommendedSymbologiesFromPolicy,
  TAG_MATERIAL_VARIANTS,
  TAG_SYMBOLOGIES,
  TAG_VIEWER_POLICIES,
  type AssetProductClass,
  type TagMaterialVariant,
  type TagOutputFormat,
  type TagSymbology,
  type TagViewerPolicy,
} from "@/lib/asset-generation";

import type {
  ManufacturerProductModel,
  SerializationReadinessRow,
  TagGenerationBatchRow,
  TagGenerationSummary,
  TagGenerationWorkspacePayload,
} from "./types";

type CreateBatchState = {
  productModelId: string;
  productClass: AssetProductClass;
  quantity: string;
  serialPrefix: string;
  serialStart: string;
  serialPadLength: string;
  includeCartonRegistrationTags: boolean;
  symbologies: TagSymbology[];
  defaultSymbology: TagSymbology;
  materialVariant: TagMaterialVariant;
  viewerPolicy: TagViewerPolicy;
  printSizeMm: string;
  outputFormat: TagOutputFormat;
};

type CreateBatchApiResponse = {
  batch?: {
    id: string;
    batchCode: string;
    createdAt: string;
    productClass: AssetProductClass;
    quantity: number;
    serialPrefix: string | null;
    serialStart: string | null;
    serialEnd: string | null;
    includeCartonRegistrationTags: boolean;
    defaultSymbology: TagSymbology;
    symbologies: TagSymbology[];
    assetsGenerated: number;
    tagsGenerated: number;
    tagCountBySymbology: Partial<Record<TagSymbology, number>>;
  };
  error?: string;
};

type StickerWizardClientProps = Partial<{
  initialProductModels: ManufacturerProductModel[];
  initialReadinessRows: SerializationReadinessRow[];
  initialBatches: TagGenerationBatchRow[];
  initialSummary: TagGenerationSummary;
}>;

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function asPositiveInteger(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function classSupportsCartonTags(productClass: AssetProductClass) {
  return productClass === "main_product";
}

function hasSymbology(
  row: TagGenerationBatchRow | undefined,
  symbology: TagSymbology,
) {
  if (!row) {
    return false;
  }

  return (row.tagCountBySymbology[symbology] ?? 0) > 0;
}

async function fetchTagGenerationWorkspace() {
  const response = await fetch("/api/manufacturer/tag-generation/workspace", {
    cache: "no-store",
  });
  const payload = (await response.json()) as
    | TagGenerationWorkspacePayload
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Unable to load factory serialization workspace.",
    );
  }

  return payload as TagGenerationWorkspacePayload;
}

export function StickerWizardClient({
  initialProductModels = [],
  initialReadinessRows = [],
  initialBatches = [],
  initialSummary = {
    totalBatches: 0,
    totalAssets: 0,
    totalTags: 0,
    qrTags: 0,
    dataMatrixTags: 0,
    nfcTags: 0,
    readyForDispatch: 0,
    dispatchMatched: 0,
    pendingDispatchMatches: 0,
  },
}: StickerWizardClientProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(
    initialProductModels.length === 0 &&
      initialReadinessRows.length === 0 &&
      initialBatches.length === 0,
  );
  const [isRefreshingWorkspace, setIsRefreshingWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productModels, setProductModels] =
    useState<ManufacturerProductModel[]>(initialProductModels);
  const [summary, setSummary] = useState<TagGenerationSummary>(initialSummary);
  const [readinessRows, setReadinessRows] =
    useState<SerializationReadinessRow[]>(initialReadinessRows);
  const [batches, setBatches] = useState<TagGenerationBatchRow[]>(initialBatches);
  const [selectedBatchId, setSelectedBatchId] = useState(
    initialBatches[0]?.id ?? "",
  );
  const [form, setForm] = useState<CreateBatchState>({
    productModelId: initialProductModels[0]?.id ?? "",
    productClass: "main_product",
    quantity: "100",
    serialPrefix: "",
    serialStart: "",
    serialPadLength: "4",
    includeCartonRegistrationTags: true,
    symbologies: ["qr"],
    defaultSymbology: "qr",
    materialVariant: "standard",
    viewerPolicy: "public",
    printSizeMm: "30",
    outputFormat: "standard",
  });

  const applyWorkspacePayload = (payload: TagGenerationWorkspacePayload) => {
    setProductModels(payload.productModels);
    setReadinessRows(payload.readinessRows);
    setBatches(payload.batches);
    setSummary(payload.summary);
    setSelectedBatchId((current) => current || payload.batches[0]?.id || "");
    setForm((current) => ({
      ...current,
      productModelId: current.productModelId || payload.productModels[0]?.id || "",
    }));
  };

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const payload = await fetchTagGenerationWorkspace();
        if (!cancelled) {
          applyWorkspacePayload(payload);
        }
      } catch (workspaceError) {
        if (!cancelled) {
          setError(
            workspaceError instanceof Error
              ? workspaceError.message
              : "Unable to load factory serialization workspace.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWorkspace(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProductModel = useMemo(
    () => productModels.find((productModel) => productModel.id === form.productModelId),
    [form.productModelId, productModels],
  );
  const selectedProductModelHasSapBinding = Boolean(
    selectedProductModel?.externalItemCode,
  );
  const requiresFactorySerialRange = form.productClass === "main_product";
  const hasWorkspaceData =
    productModels.length > 0 ||
    readinessRows.length > 0 ||
    batches.length > 0 ||
    summary.totalBatches > 0 ||
    summary.totalAssets > 0;

  const recommendedSymbologies = useMemo(() => {
    if (!selectedProductModel) {
      return ["qr"] satisfies TagSymbology[];
    }

    return recommendedSymbologiesFromPolicy({
      productClass: form.productClass,
      activationMode: selectedProductModel.activationMode ?? "plug_and_play",
      partTraceabilityMode: selectedProductModel.partTraceabilityMode ?? "none",
      smallPartTrackingMode: selectedProductModel.smallPartTrackingMode ?? "individual",
    });
  }, [form.productClass, selectedProductModel]);

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);
  const canGenerate = productModels.length > 0 && !isSubmitting && !isLoadingWorkspace;
  const isPcbMicroMode = form.outputFormat === "pcb_micro_dm";

  useEffect(() => {
    if (!isPcbMicroMode) {
      return;
    }

    setForm((current) => {
      if (
        current.symbologies.length === 1 &&
        current.symbologies[0] === "data_matrix" &&
        current.defaultSymbology === "data_matrix" &&
        current.materialVariant === "high_temp" &&
        current.viewerPolicy === "technician_admin" &&
        current.printSizeMm === "10" &&
        current.includeCartonRegistrationTags === false
      ) {
        return current;
      }

      return {
        ...current,
        symbologies: ["data_matrix"],
        defaultSymbology: "data_matrix",
        materialVariant: "high_temp",
        viewerPolicy: "technician_admin",
        printSizeMm: "10",
        includeCartonRegistrationTags: false,
      };
    });
  }, [isPcbMicroMode]);

  const applyRecommendedSymbologies = () => {
    setForm((current) => {
      const nextSymbologies = [...recommendedSymbologies];
      return {
        ...current,
        symbologies: nextSymbologies,
        defaultSymbology: nextSymbologies[0] ?? current.defaultSymbology,
      };
    });
  };

  const toggleSymbology = (symbology: TagSymbology) => {
    setForm((current) => {
      const exists = current.symbologies.includes(symbology);
      const nextSymbologies = exists
        ? current.symbologies.filter((value) => value !== symbology)
        : [...current.symbologies, symbology];

      if (nextSymbologies.length === 0) {
        return current;
      }

      return {
        ...current,
        symbologies: nextSymbologies,
        defaultSymbology: nextSymbologies.includes(current.defaultSymbology)
          ? current.defaultSymbology
          : nextSymbologies[0],
      };
    });
  };

  const refreshWorkspace = async () => {
    setIsRefreshingWorkspace(true);
    setError(null);

    try {
      applyWorkspacePayload(await fetchTagGenerationWorkspace());
    } catch (workspaceError) {
      setError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Unable to refresh factory serialization workspace.",
      );
    } finally {
      setIsRefreshingWorkspace(false);
    }
  };

  const createBatch = async () => {
    setError(null);

    const quantity = asPositiveInteger(form.quantity);
    if (!quantity) {
      setError("Quantity must be a positive integer.");
      return;
    }

    if (!form.productModelId) {
      setError("Select a product model.");
      return;
    }

    if (requiresFactorySerialRange && !selectedProductModelHasSapBinding) {
      setError(
        "Factory serialization requires a product model that is linked to SAP item master.",
      );
      return;
    }

    if (form.symbologies.length === 0) {
      setError("Select at least one symbology.");
      return;
    }

    const useSerials = form.serialPrefix.trim().length > 0 || form.serialStart.trim().length > 0;
    const serialStart = useSerials ? asPositiveInteger(form.serialStart) : null;
    const serialPadLength = form.serialPadLength.trim().length
      ? asPositiveInteger(form.serialPadLength)
      : null;

    if (requiresFactorySerialRange && !form.serialPrefix.trim()) {
      setError("Serial prefix is required for main-product factory serialization.");
      return;
    }

    if (requiresFactorySerialRange && !serialStart) {
      setError("Serial start must be a positive integer for main-product factory serialization.");
      return;
    }

    if (
      serialPadLength !== null &&
      (!Number.isInteger(serialPadLength) || serialPadLength < 1 || serialPadLength > 20)
    ) {
      setError("Serial pad length must be an integer between 1 and 20.");
      return;
    }

    if (useSerials && !form.serialPrefix.trim()) {
      setError("Serial prefix is required when using serial generation.");
      return;
    }

    if (useSerials && !serialStart) {
      setError("Serial start must be a positive integer when using serial generation.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/manufacturer/tag-generation/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productModelId: form.productModelId,
          productClass: form.productClass,
          quantity,
          serialPrefix: useSerials ? form.serialPrefix.trim() : null,
          serialStart: useSerials ? serialStart : null,
          serialPadLength: useSerials ? serialPadLength : null,
          includeCartonRegistrationTags:
            classSupportsCartonTags(form.productClass) &&
            form.includeCartonRegistrationTags,
          symbologies: form.symbologies,
          defaultSymbology: form.defaultSymbology,
          materialVariant: form.materialVariant,
          viewerPolicy: form.viewerPolicy,
          printSizeMm: asPositiveInteger(form.printSizeMm),
          outputProfile: {
            source: "manufacturer_ui",
            format: form.outputFormat,
          },
        }),
      });

      const payload = (await response.json()) as CreateBatchApiResponse;
      if (!response.ok || !payload.batch) {
        throw new Error(payload.error ?? "Unable to create generation batch.");
      }

      const model = productModels.find(
        (productModel) => productModel.id === form.productModelId,
      );

      const row: TagGenerationBatchRow = {
        id: payload.batch.id,
        batchCode: payload.batch.batchCode,
        createdAt: payload.batch.createdAt,
        productClass: payload.batch.productClass,
        quantity: payload.batch.quantity,
        serialPrefix: payload.batch.serialPrefix,
        serialStart: payload.batch.serialStart,
        serialEnd: payload.batch.serialEnd,
        includeCartonRegistrationTags: payload.batch.includeCartonRegistrationTags,
        defaultSymbology: payload.batch.defaultSymbology,
        symbologies: payload.batch.symbologies,
        outputProfile: {
          format: form.outputFormat,
        },
        productModel: {
          id: form.productModelId,
          name: model?.name ?? "Unknown Model",
        },
        assetsGenerated: payload.batch.assetsGenerated,
        tagsGenerated: payload.batch.tagsGenerated,
        tagCountBySymbology: payload.batch.tagCountBySymbology,
      };

      setBatches((current) => [row, ...current]);
      setSelectedBatchId(row.id);
      setSummary((current) => ({
        totalBatches: current.totalBatches + 1,
        totalAssets: current.totalAssets + row.assetsGenerated,
        totalTags: current.totalTags + row.tagsGenerated,
        qrTags: current.qrTags + (row.tagCountBySymbology.qr ?? 0),
        dataMatrixTags:
          current.dataMatrixTags + (row.tagCountBySymbology.data_matrix ?? 0),
        nfcTags: current.nfcTags + (row.tagCountBySymbology.nfc_uri ?? 0),
        readyForDispatch: (current.readyForDispatch ?? 0) + row.assetsGenerated,
        dispatchMatched: current.dispatchMatched ?? 0,
        pendingDispatchMatches: current.pendingDispatchMatches ?? 0,
      }));

      if (row.productClass === "main_product") {
        setReadinessRows((current) => {
          const next = [...current];
          const existingIndex = next.findIndex(
            (entry) => entry.productModelId === form.productModelId,
          );
          const baseEntry: SerializationReadinessRow = {
            productModelId: form.productModelId,
            productModelName: model?.name ?? "Unknown Model",
            modelNumber: model?.modelNumber ?? "",
            externalItemCode: model?.externalItemCode ?? null,
            externalItemSeriesCode: model?.externalItemSeriesCode ?? null,
            generatedAssets: 0,
            readyForDispatch: 0,
            dispatchMatched: 0,
            pendingDispatchMatches: 0,
          };
          const currentEntry =
            existingIndex >= 0 ? next[existingIndex] : baseEntry;
          const updatedEntry: SerializationReadinessRow = {
            ...currentEntry,
            generatedAssets: currentEntry.generatedAssets + row.assetsGenerated,
            readyForDispatch: currentEntry.readyForDispatch + row.assetsGenerated,
          };

          if (existingIndex >= 0) {
            next[existingIndex] = updatedEntry;
          } else {
            next.push(updatedEntry);
          }

          return next.sort((left, right) => {
            if (right.pendingDispatchMatches !== left.pendingDispatchMatches) {
              return right.pendingDispatchMatches - left.pendingDispatchMatches;
            }

            if (right.generatedAssets !== left.generatedAssets) {
              return right.generatedAssets - left.generatedAssets;
            }

            return left.productModelName.localeCompare(right.productModelName);
          });
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create generation batch.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Factory Serialization"
        description="Create pre-dispatch serialized machine identities, generate QR and Data Matrix outputs, and keep dispatch reconciliation visible from one manufacturer workspace."
      />

      <div className="mb-4 flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => void refreshWorkspace()}
          disabled={isRefreshingWorkspace || isLoadingWorkspace}
        >
          {isRefreshingWorkspace ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              Refreshing...
            </>
          ) : (
            "Refresh Workspace"
          )}
        </Button>
      </div>

      {isLoadingWorkspace ? <ClientPageLoading rows={7} /> : null}

      {!isLoadingWorkspace && error && !hasWorkspaceData ? (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!isLoadingWorkspace ? (
        <>

      <Card>
        <CardHeader>
          <CardTitle>Serialization Workflow</CardTitle>
          <CardDescription>
            The main-product path is now SAP-item-linked by design: import item master first, create factory serials next, and then let serialized dispatch lines reconcile against those assets.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border bg-slate-50 p-4">
            <p className="text-sm font-semibold">1. SAP item master first</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Main-product serialization only works when the selected product model is
              already mapped to an SAP item code.
            </p>
          </div>
          <div className="rounded-md border bg-slate-50 p-4">
            <p className="text-sm font-semibold">2. Create factory serial range</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate serialized asset identities and output batches before the machine
              leaves production.
            </p>
          </div>
          <div className="rounded-md border bg-slate-50 p-4">
            <p className="text-sm font-semibold">3. Reconcile dispatch automatically</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When SAP dispatch arrives, matching serials can move out of{" "}
              <span className="font-mono">pending_match</span> and into the installed
              equipment lifecycle.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Serialization Batches</CardDescription>
            <CardTitle>{summary.totalBatches.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Serialized Assets</CardDescription>
            <CardTitle>{summary.totalAssets.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready For Dispatch</CardDescription>
            <CardTitle>{(summary.readyForDispatch ?? 0).toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dispatch Matched</CardDescription>
            <CardTitle>{(summary.dispatchMatched ?? 0).toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending SAP Matches</CardDescription>
            <CardTitle>
              {(summary.pendingDispatchMatches ?? 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tags</CardDescription>
            <CardTitle>{summary.totalTags.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Create Serialization Batch</CardTitle>
          <CardDescription>
            Generate canonical asset identities and multi-symbology outputs for main
            products, spares, small parts, kits, and packs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {productModels.length === 0 && !isLoadingWorkspace ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Create or import at least one product model before generating serialized
              assets.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>Product Series</span>
              <select
                value={form.productModelId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    productModelId: event.target.value,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isSubmitting || isLoadingWorkspace || productModels.length === 0}
              >
                {productModels.map((productModel) => (
                  <option key={productModel.id} value={productModel.id}>
                    {productModel.name} ({productModel.modelNumber || "No model number"})
                    {productModel.externalItemCode
                      ? ` • ${productModel.externalItemCode}`
                      : " • SAP item missing"}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Asset Class</span>
              <select
                value={form.productClass}
                onChange={(event) => {
                  const nextProductClass = event.target.value as AssetProductClass;
                  setForm((current) => ({
                    ...current,
                    productClass: nextProductClass,
                    includeCartonRegistrationTags:
                      nextProductClass === "main_product"
                        ? current.includeCartonRegistrationTags
                        : false,
                  }));
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isSubmitting}
              >
                {ASSET_PRODUCT_CLASSES.map((itemClass) => (
                  <option key={itemClass} value={itemClass}>
                    {formatProductClassLabel(itemClass)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Batch Quantity</span>
              <Input
                type="number"
                value={form.quantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
                disabled={isSubmitting}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span>Serial Prefix</span>
              <Input
                value={form.serialPrefix}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serialPrefix: event.target.value,
                  }))
                }
                placeholder="e.g. AX-IND-"
                disabled={isSubmitting}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span>Serial Start</span>
              <Input
                type="number"
                value={form.serialStart}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serialStart: event.target.value,
                  }))
                }
                disabled={isSubmitting}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span>Serial Pad Length</span>
              <Input
                type="number"
                value={form.serialPadLength}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serialPadLength: event.target.value,
                  }))
                }
                min="1"
                max="20"
                disabled={isSubmitting}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span>Output Format</span>
              <select
                value={form.outputFormat}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    outputFormat: event.target.value as TagOutputFormat,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isSubmitting}
              >
                {TAG_OUTPUT_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {formatTagOutputFormatLabel(format)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Print Size (mm)</span>
              <Input
                type="number"
                value={form.printSizeMm}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    printSizeMm: event.target.value,
                  }))
                }
                disabled={isSubmitting || isPcbMicroMode}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span>Material Variant</span>
              <select
                value={form.materialVariant}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    materialVariant: event.target.value as TagMaterialVariant,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isSubmitting || isPcbMicroMode}
              >
                {TAG_MATERIAL_VARIANTS.map((variant) => (
                  <option key={variant} value={variant}>
                    {variant.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Viewer Policy</span>
              <select
                value={form.viewerPolicy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    viewerPolicy: event.target.value as TagViewerPolicy,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isSubmitting || isPcbMicroMode}
              >
                {TAG_VIEWER_POLICIES.map((policy) => (
                  <option key={policy} value={policy}>
                    {policy.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedProductModel ? (
            <div className="grid gap-3 rounded-md border bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  SAP Item Code
                </p>
                <p className="mt-1 text-sm font-medium">
                  {selectedProductModel.externalItemCode || "Not linked yet"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  SAP Series Code
                </p>
                <p className="mt-1 text-sm font-medium">
                  {selectedProductModel.externalItemSeriesCode || "Not linked yet"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Activation Mode
                </p>
                <p className="mt-1 text-sm font-medium">
                  {selectedProductModel.activationMode?.replace(/_/g, " ") ??
                    "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Part Traceability
                </p>
                <p className="mt-1 text-sm font-medium">
                  {selectedProductModel.partTraceabilityMode?.replace(/_/g, " ") ??
                    "Not set"}
                </p>
              </div>
            </div>
          ) : null}

          {requiresFactorySerialRange && !selectedProductModelHasSapBinding ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This product model is not linked to SAP item master yet. Import the item
              master first, then create the factory serialization batch.
            </div>
          ) : null}

          {classSupportsCartonTags(form.productClass) ? (
            <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
              <input
                type="checkbox"
                checked={form.includeCartonRegistrationTags}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    includeCartonRegistrationTags: event.target.checked,
                  }))
                }
                className="mt-0.5"
                disabled={isSubmitting || isPcbMicroMode}
              />
              <span>
                <span className="font-medium">Include carton registration tags</span>{" "}
                <span className="text-muted-foreground">
                  for installation-driven sale registration workflows.
                </span>
              </span>
            </label>
          ) : null}

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Symbology Selection</p>
                <p className="text-xs text-muted-foreground">
                  {isPcbMicroMode
                    ? "PCB micro mode forces Data Matrix only with a short resolver token payload."
                    : "Choose one or more symbologies for this batch."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyRecommendedSymbologies}
                disabled={isSubmitting || isPcbMicroMode}
              >
                Use Policy Recommendation
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {TAG_SYMBOLOGIES.map((symbology) => {
                const checked = form.symbologies.includes(symbology);
                return (
                  <label
                    key={symbology}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      checked ? "border-primary bg-primary/5" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSymbology(symbology)}
                      disabled={isSubmitting || isPcbMicroMode}
                    />
                    {formatSymbologyLabel(symbology)}
                  </label>
                );
              })}
            </div>

            <label className="space-y-1 text-sm">
              <span>Default Symbology</span>
              <select
                value={form.defaultSymbology}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultSymbology: event.target.value as TagSymbology,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isSubmitting || isPcbMicroMode}
              >
                {form.symbologies.map((symbology) => (
                  <option key={symbology} value={symbology}>
                    {formatSymbologyLabel(symbology)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isPcbMicroMode ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              PCB Micro Data Matrix mode generates 10x10 mm Data Matrix-only labels
              with 8-character resolver tokens for high-density board labeling and
              print-sheet packing up to 250 labels per A4 page.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={() => void createBatch()} disabled={!canGenerate}>
              {isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Creating batch...
                </>
              ) : (
                <>
                  <PackagePlusIcon className="size-4" />
                  Create Serialization Batch
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Product Series Readiness</CardTitle>
          <CardDescription>
            Track which SAP-linked product models already have factory serials ready and
            where dispatch reconciliation is still waiting for a match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Series</TableHead>
                <TableHead>SAP Item</TableHead>
                <TableHead className="text-right">Generated</TableHead>
                <TableHead className="text-right">Ready</TableHead>
                <TableHead className="text-right">Matched</TableHead>
                <TableHead className="text-right">Pending Match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {readinessRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No factory serialization batches exist yet.
                  </TableCell>
                </TableRow>
              ) : (
                readinessRows.map((row) => (
                  <TableRow key={row.productModelId}>
                    <TableCell>
                      <div className="font-medium">{row.productModelName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.modelNumber || "No model number"}
                        {row.externalItemSeriesCode
                          ? ` • Series ${row.externalItemSeriesCode}`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell>{row.externalItemCode ?? "Not linked"}</TableCell>
                    <TableCell className="text-right">
                      {row.generatedAssets.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.readyForDispatch.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.dispatchMatched.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.pendingDispatchMatches.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Factory Output Exports</CardTitle>
          <CardDescription>
            Download QR, Data Matrix, manifest, and NFC outputs from any serialization
            batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-1 text-sm">
            <span>Select Batch</span>
            <select
              value={selectedBatchId}
              onChange={(event) => setSelectedBatchId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a batch…</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchCode} ({batch.productModel.name}, {formatProductClassLabel(batch.productClass)})
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
            <a
              href={
                selectedBatchId && hasSymbology(selectedBatch, "qr")
                  ? `/api/manufacturer/tag-generation/batches/${encodeURIComponent(
                      selectedBatchId,
                    )}/exports/qr?format=png_zip`
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              className={
                selectedBatchId && hasSymbology(selectedBatch, "qr")
                  ? "inline-flex"
                  : "pointer-events-none inline-flex opacity-60"
              }
            >
              <Button
                type="button"
                disabled={!selectedBatchId || !hasSymbology(selectedBatch, "qr")}
              >
                Download QR ZIP
              </Button>
            </a>

            <a
              href={
                selectedBatchId && hasSymbology(selectedBatch, "data_matrix")
                  ? `/api/manufacturer/tag-generation/batches/${encodeURIComponent(
                      selectedBatchId,
                    )}/exports/data-matrix?format=html`
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              className={
                selectedBatchId && hasSymbology(selectedBatch, "data_matrix")
                  ? "inline-flex"
                  : "pointer-events-none inline-flex opacity-60"
              }
            >
              <Button
                type="button"
                variant="secondary"
                disabled={!selectedBatchId || !hasSymbology(selectedBatch, "data_matrix")}
              >
                Open Print Sheet
              </Button>
            </a>

            <a
              href={
                selectedBatchId && hasSymbology(selectedBatch, "data_matrix")
                  ? `/api/manufacturer/tag-generation/batches/${encodeURIComponent(
                      selectedBatchId,
                    )}/exports/data-matrix?format=csv`
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              className={
                selectedBatchId && hasSymbology(selectedBatch, "data_matrix")
                  ? "inline-flex"
                  : "pointer-events-none inline-flex opacity-60"
              }
            >
              <Button
                type="button"
                variant="outline"
                disabled={!selectedBatchId || !hasSymbology(selectedBatch, "data_matrix")}
              >
                Download Data Matrix CSV
              </Button>
            </a>

            <a
              href={
                selectedBatchId
                  ? `/api/manufacturer/tag-generation/batches/${encodeURIComponent(
                      selectedBatchId,
                    )}/exports/manifest?format=json`
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              className={selectedBatchId ? "inline-flex" : "pointer-events-none inline-flex opacity-60"}
            >
              <Button type="button" variant="secondary" disabled={!selectedBatchId}>
                Download Manifest JSON
              </Button>
            </a>

            <a
              href={
                selectedBatchId && hasSymbology(selectedBatch, "nfc_uri")
                  ? `/api/manufacturer/tag-generation/batches/${encodeURIComponent(
                      selectedBatchId,
                    )}/exports/nfc?format=csv`
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              className={
                selectedBatchId && hasSymbology(selectedBatch, "nfc_uri")
                  ? "inline-flex"
                  : "pointer-events-none inline-flex opacity-60"
              }
            >
              <Button
                type="button"
                variant="outline"
                disabled={!selectedBatchId || !hasSymbology(selectedBatch, "nfc_uri")}
              >
                Download NFC CSV
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Serialization History</CardTitle>
          <CardDescription>
            Recent factory serialization batches and label outputs for this manufacturer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Symbologies</TableHead>
                <TableHead className="text-right">Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No batches generated yet.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>{formatDate(batch.createdAt)}</TableCell>
                    <TableCell className="font-medium">{batch.batchCode}</TableCell>
                    <TableCell>{batch.productModel.name}</TableCell>
                    <TableCell>{formatProductClassLabel(batch.productClass)}</TableCell>
                    <TableCell>{batch.quantity.toLocaleString()}</TableCell>
                    <TableCell>
                      {batch.symbologies.map((symbology) => formatSymbologyLabel(symbology)).join(", ")}
                      {batch.includeCartonRegistrationTags ? ", Carton QR" : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {batch.tagsGenerated.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </>
      ) : null}
    </div>
  );
}

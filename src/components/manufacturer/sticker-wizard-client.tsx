"use client";

import { useMemo, useState } from "react";
import { Loader2Icon, PackagePlusIcon } from "lucide-react";

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
  formatProductClassLabel,
  formatSymbologyLabel,
  recommendedSymbologiesFromPolicy,
  TAG_MATERIAL_VARIANTS,
  TAG_SYMBOLOGIES,
  TAG_VIEWER_POLICIES,
  type AssetProductClass,
  type TagMaterialVariant,
  type TagSymbology,
  type TagViewerPolicy,
} from "@/lib/asset-generation";

import type {
  ManufacturerProductModel,
  TagGenerationBatchRow,
  TagGenerationSummary,
} from "./types";

type CreateBatchState = {
  productModelId: string;
  productClass: AssetProductClass;
  quantity: string;
  serialPrefix: string;
  serialStart: string;
  includeCartonRegistrationTags: boolean;
  symbologies: TagSymbology[];
  defaultSymbology: TagSymbology;
  materialVariant: TagMaterialVariant;
  viewerPolicy: TagViewerPolicy;
  printSizeMm: string;
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

type StickerWizardClientProps = {
  initialProductModels: ManufacturerProductModel[];
  initialBatches: TagGenerationBatchRow[];
  initialSummary: TagGenerationSummary;
};

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

export function StickerWizardClient({
  initialProductModels,
  initialBatches,
  initialSummary,
}: StickerWizardClientProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TagGenerationSummary>(initialSummary);
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
    includeCartonRegistrationTags: true,
    symbologies: ["qr"],
    defaultSymbology: "qr",
    materialVariant: "standard",
    viewerPolicy: "public",
    printSizeMm: "30",
  });

  const selectedProductModel = useMemo(
    () =>
      initialProductModels.find((productModel) => productModel.id === form.productModelId),
    [form.productModelId, initialProductModels],
  );

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
  const canGenerate = initialProductModels.length > 0 && !isSubmitting;

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

    if (form.symbologies.length === 0) {
      setError("Select at least one symbology.");
      return;
    }

    const useSerials = form.serialPrefix.trim().length > 0 || form.serialStart.trim().length > 0;
    const serialStart = useSerials ? asPositiveInteger(form.serialStart) : null;

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
          },
        }),
      });

      const payload = (await response.json()) as CreateBatchApiResponse;
      if (!response.ok || !payload.batch) {
        throw new Error(payload.error ?? "Unable to create generation batch.");
      }

      const model = initialProductModels.find(
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
      }));
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
        title="Generate Item Labels"
        description="Generate canonical asset identities and multi-symbology tags for main products, spares, small parts, kits, and packs."
      />

      <Card>
        <CardHeader>
          <CardTitle>Tag Generation Batch</CardTitle>
          <CardDescription>
            Create one generic batch and export QR, Data Matrix, NFC, and manifest outputs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {initialProductModels.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Create at least one product model before generating assets and tags.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>Product Model</span>
              <select
                value={form.productModelId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    productModelId: event.target.value,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isSubmitting || initialProductModels.length === 0}
              >
                {initialProductModels.map((productModel) => (
                  <option key={productModel.id} value={productModel.id}>
                    {productModel.name} ({productModel.modelNumber || "No model number"})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Item Class</span>
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
              <span>Quantity</span>
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
              <span>Serial Prefix (optional)</span>
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
              <span>Serial Start (optional)</span>
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                {TAG_VIEWER_POLICIES.map((policy) => (
                  <option key={policy} value={policy}>
                    {policy.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                disabled={isSubmitting}
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
                  Choose one or more symbologies for this batch.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyRecommendedSymbologies}
                disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                {form.symbologies.map((symbology) => (
                  <option key={symbology} value={symbology}>
                    {formatSymbologyLabel(symbology)}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                  Generating...
                </>
              ) : (
                <>
                  <PackagePlusIcon className="size-4" />
                  Create Tag Generation Batch
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Batches</CardDescription>
            <CardTitle>{summary.totalBatches.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Assets</CardDescription>
            <CardTitle>{summary.totalAssets.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tags</CardDescription>
            <CardTitle>{summary.totalTags.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>QR Tags</CardDescription>
            <CardTitle>{summary.qrTags.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data Matrix Tags</CardDescription>
            <CardTitle>{summary.dataMatrixTags.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>NFC URI Tags</CardDescription>
            <CardTitle>{summary.nfcTags.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Export Outputs</CardTitle>
          <CardDescription>
            Download QR, Data Matrix, manifest, and NFC outputs from any generated batch.
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
          <CardTitle>Batch History</CardTitle>
          <CardDescription>Recent tag generation batches for this manufacturer.</CardDescription>
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
    </div>
  );
}

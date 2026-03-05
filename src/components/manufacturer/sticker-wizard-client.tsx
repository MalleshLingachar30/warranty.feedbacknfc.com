"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

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

import type {
  AllocationHistoryRow,
  ManufacturerProductModel,
  StickerInventorySummary,
} from "./types";
import { type ManufacturerStickerConfig } from "@/lib/sticker-config";

type WizardState = {
  stickerStart: string;
  stickerEnd: string;
  stickerVariant: "standard" | "high_temp" | "premium";
  productModelId: string;
  serialPrefix: string;
  serialStart: string;
  serialEnd: string;
};

type PreviewRow = {
  type: "row" | "ellipsis";
  sticker: string;
  serial: string;
};

type StickerWizardClientProps = {
  initialProductModels: ManufacturerProductModel[];
  initialAllocationHistory: AllocationHistoryRow[];
  initialInventory: StickerInventorySummary;
  stickerConfig: ManufacturerStickerConfig;
  hasRealAllocations: boolean;
};

const stepTitles = [
  "Sticker Range",
  "Product Model",
  "Serial Range",
  "Review",
  "Success",
];

function isProbablyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatSerial(prefix: string, number: number, padLength: number) {
  return `${prefix}${number.toString().padStart(padLength, "0")}`;
}

function buildPreviewRows(
  stickerStart: number,
  serialStart: number,
  count: number,
  serialPrefix: string,
  serialPadLength: number,
): PreviewRow[] {
  if (count <= 0) {
    return [];
  }

  const buildRow = (offset: number): PreviewRow => ({
    type: "row",
    sticker: (stickerStart + offset).toString(),
    serial: formatSerial(serialPrefix, serialStart + offset, serialPadLength),
  });

  if (count <= 10) {
    return Array.from({ length: count }, (_, offset) => buildRow(offset));
  }

  return [
    ...Array.from({ length: 5 }, (_, offset) => buildRow(offset)),
    {
      type: "ellipsis",
      sticker: "...",
      serial: "...",
    },
    ...Array.from({ length: 5 }, (_, offset) => buildRow(count - 5 + offset)),
  ];
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function StickerWizardClient({
  initialProductModels,
  initialAllocationHistory,
  initialInventory,
  stickerConfig,
  hasRealAllocations,
}: StickerWizardClientProps) {
  const [step, setStep] = useState(1);
  const defaultStickerVariant =
    stickerConfig.mode === "nfc_qr" ? "premium" : "standard";
  const [wizard, setWizard] = useState<WizardState>(() => ({
    stickerStart: "",
    stickerEnd: "",
    stickerVariant: defaultStickerVariant,
    productModelId: initialProductModels[0]?.id ?? "",
    serialPrefix: "",
    serialStart: "",
    serialEnd: "",
  }));
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allocationHistory, setAllocationHistory] = useState<
    AllocationHistoryRow[]
  >(initialAllocationHistory);
  const [inventory, setInventory] = useState(initialInventory);
  const [lastAllocationId, setLastAllocationId] = useState("");
  const [lastAllocatedCount, setLastAllocatedCount] = useState(0);

  const initialProductionAllocationId =
    initialAllocationHistory.find((entry) => isProbablyUuid(entry.id))?.id ?? "";
  const [productionAllocationId, setProductionAllocationId] = useState(
    initialProductionAllocationId,
  );
  const [qrSizeMm, setQrSizeMm] = useState<25 | 30 | 35>(30);
  const [qrErrorCorrection, setQrErrorCorrection] = useState<
    "L" | "M" | "Q" | "H"
  >("H");
  const [qrFormat, setQrFormat] = useState<"pdf_sheet" | "png_zip" | "csv">(
    "png_zip",
  );
  const [nfcFormat, setNfcFormat] = useState<"ndef_uri_csv" | "nfc_tools_json">(
    "ndef_uri_csv",
  );

  const parsedStickerStart = Number(wizard.stickerStart);
  const parsedStickerEnd = Number(wizard.stickerEnd);
  const parsedSerialStart = Number(wizard.serialStart);
  const parsedSerialEnd = Number(wizard.serialEnd);

  const stickerCount =
    Number.isFinite(parsedStickerStart) &&
    Number.isFinite(parsedStickerEnd) &&
    parsedStickerEnd >= parsedStickerStart
      ? parsedStickerEnd - parsedStickerStart + 1
      : 0;

  const serialCount =
    Number.isFinite(parsedSerialStart) &&
    Number.isFinite(parsedSerialEnd) &&
    parsedSerialEnd >= parsedSerialStart
      ? parsedSerialEnd - parsedSerialStart + 1
      : 0;

  const serialPadLength = Math.max(
    String(parsedSerialStart).length,
    String(parsedSerialEnd).length,
    5,
  );

  const previewRows = useMemo(
    () =>
      buildPreviewRows(
        parsedStickerStart,
        parsedSerialStart,
        Math.min(stickerCount, serialCount),
        wizard.serialPrefix,
        serialPadLength,
      ),
    [
      parsedSerialStart,
      parsedStickerStart,
      serialCount,
      serialPadLength,
      stickerCount,
      wizard.serialPrefix,
    ],
  );

  const selectedProductModel = initialProductModels.find(
    (productModel) => productModel.id === wizard.productModelId,
  );

  const technologyLabel =
    stickerConfig.mode === "qr_only"
      ? "QR Code Only"
      : stickerConfig.mode === "nfc_qr"
        ? "NFC + QR Code"
        : "NFC Only (no QR printed)";

  const allowedVariants = useMemo<WizardState["stickerVariant"][]>(() => {
    if (stickerConfig.mode === "qr_only") {
      return ["standard", "high_temp"];
    }

    if (stickerConfig.mode === "nfc_qr") {
      return ["premium"];
    }

    return ["standard"];
  }, [stickerConfig.mode]);

  const effectiveStickerVariant = allowedVariants.includes(wizard.stickerVariant)
    ? wizard.stickerVariant
    : allowedVariants[0];

  const stickerVariantLabel =
    effectiveStickerVariant === "high_temp"
      ? "High Temperature (up to 150°C)"
      : effectiveStickerVariant === "premium"
        ? "Premium"
        : "Standard (up to 80°C)";

  const goToNextStep = () => {
    setWizardError(null);

    if (step === 1 && stickerCount <= 0) {
      setWizardError("Enter a valid sticker start and end range.");
      return;
    }

    if (step === 2 && !wizard.productModelId) {
      setWizardError("Select a product model before continuing.");
      return;
    }

    if (step === 3) {
      if (!wizard.serialPrefix.trim()) {
        setWizardError("Enter a serial prefix before continuing.");
        return;
      }

      if (serialCount <= 0) {
        setWizardError("Enter a valid appliance serial range.");
        return;
      }

      if (stickerCount !== serialCount) {
        setWizardError(
          "Sticker count and serial count must match for one-to-one binding.",
        );
        return;
      }
    }

    setStep((current) => Math.min(current + 1, 5));
  };

  const goToPreviousStep = () => {
    setWizardError(null);
    setStep((current) => Math.max(current - 1, 1));
  };

  const confirmAllocation = async () => {
    setWizardError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/manufacturer/allocate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stickerStartNumber: parsedStickerStart,
          stickerEndNumber: parsedStickerEnd,
          stickerVariant: effectiveStickerVariant,
          productModelId: wizard.productModelId,
          serialPrefix: wizard.serialPrefix,
          serialStartNumber: parsedSerialStart,
          serialEndNumber: parsedSerialEnd,
        }),
      });

      const json = (await response.json()) as {
        error?: string;
        allocation?: {
          id: string;
          allocationId: string;
          totalCount: number;
        };
        inventory?: StickerInventorySummary;
      };

      if (!response.ok || !json.allocation || !json.inventory) {
        throw new Error(json.error ?? "Unable to complete sticker allocation.");
      }

      setInventory(json.inventory);

      const now = new Date();
      const newHistoryRow: AllocationHistoryRow = {
        id: json.allocation.id,
        allocationId: json.allocation.allocationId,
        date: now.toISOString(),
        stickerStart: parsedStickerStart,
        stickerEnd: parsedStickerEnd,
        serialPrefix: wizard.serialPrefix,
        serialStart: parsedSerialStart,
        serialEnd: parsedSerialEnd,
        productModelId: wizard.productModelId,
        productModelName: selectedProductModel?.name ?? "Unknown Model",
        count: json.allocation.totalCount,
      };

      setAllocationHistory((current) => [newHistoryRow, ...current]);
      setProductionAllocationId(newHistoryRow.id);
      setLastAllocationId(json.allocation.allocationId);
      setLastAllocatedCount(json.allocation.totalCount);
      setStep(5);
    } catch (error) {
      setWizardError(
        error instanceof Error
          ? error.message
          : "Unable to complete allocation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    setWizard({
      stickerStart: "",
      stickerEnd: "",
      stickerVariant: defaultStickerVariant,
      productModelId: initialProductModels[0]?.id ?? "",
      serialPrefix: "",
      serialStart: "",
      serialEnd: "",
    });
    setWizardError(null);
    setStep(1);
  };

  return (
    <div>
      <PageHeader
        title="Sticker Management"
        description="Bulk allocate and bind sticker ranges to product model serial ranges."
      />

      <Card>
        <CardHeader>
          <CardTitle>Bulk Allocation Wizard</CardTitle>
          <CardDescription>
            Follow each step to allocate and bind stickers in bulk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2 md:grid-cols-5">
            {stepTitles.map((stepTitle, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === step;
              const isCompleted = stepNumber < step;

              return (
                <div
                  key={stepTitle}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : isCompleted
                        ? "border-emerald-300 bg-emerald-50"
                        : ""
                  }`}
                >
                  <p className="text-xs text-muted-foreground">
                    Step {stepNumber}
                  </p>
                  <p className="font-medium">{stepTitle}</p>
                </div>
              );
            })}
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Sticker Start Number
                  </label>
                  <Input
                    type="number"
                    value={wizard.stickerStart}
                    onChange={(event) =>
                      setWizard((current) => ({
                        ...current,
                        stickerStart: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Sticker End Number
                  </label>
                  <Input
                    type="number"
                    value={wizard.stickerEnd}
                    onChange={(event) =>
                      setWizard((current) => ({
                        ...current,
                        stickerEnd: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Total Sticker Count
                  </label>
                  <Input value={stickerCount.toLocaleString()} readOnly />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Technology</label>
                  <Input value={technologyLabel} readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Material Variant</label>
                  <select
                    value={effectiveStickerVariant}
                    onChange={(event) =>
                      setWizard((current) => ({
                        ...current,
                        stickerVariant: event.target.value as WizardState["stickerVariant"],
                      }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={allowedVariants.length === 1}
                  >
                    {allowedVariants.includes("standard") ? (
                      <option value="standard">Standard (up to 80°C)</option>
                    ) : null}
                    {allowedVariants.includes("high_temp") ? (
                      <option value="high_temp">
                        High Temperature (up to 150°C)
                      </option>
                    ) : null}
                    {allowedVariants.includes("premium") ? (
                      <option value="premium">Premium</option>
                    ) : null}
                  </select>
                </div>
              </div>

              {stickerConfig.mode === "nfc_qr" || stickerConfig.mode === "nfc_only" ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  ⚠ NFC stickers require encoding. Download the NFC encoding file
                  after allocation to program NFC chips with matching URLs.
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Select Product Model
              </label>
              <select
                value={wizard.productModelId}
                onChange={(event) =>
                  setWizard((current) => ({
                    ...current,
                    productModelId: event.target.value,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {initialProductModels.length === 0 ? (
                  <option value="">No product models found</option>
                ) : null}
                {initialProductModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.modelNumber})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Serial Prefix</label>
                  <Input
                    value={wizard.serialPrefix}
                    onChange={(event) =>
                      setWizard((current) => ({
                        ...current,
                        serialPrefix: event.target.value,
                      }))
                    }
                    placeholder="e.g. AX-IND-BLR-"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Serial Start Number
                  </label>
                  <Input
                    type="number"
                    value={wizard.serialStart}
                    onChange={(event) =>
                      setWizard((current) => ({
                        ...current,
                        serialStart: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Serial End Number
                  </label>
                  <Input
                    type="number"
                    value={wizard.serialEnd}
                    onChange={(event) =>
                      setWizard((current) => ({
                        ...current,
                        serialEnd: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <Card className="bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-base">Mapping Preview</CardTitle>
                  <CardDescription>
                    Previewing first 5 and last 5 sticker-to-serial bindings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sticker Number</TableHead>
                        <TableHead>Appliance Serial</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="text-muted-foreground"
                          >
                            Enter valid ranges to view mapping preview.
                          </TableCell>
                        </TableRow>
                      ) : (
                        previewRows.map((row, index) => (
                          <TableRow key={`${row.sticker}-${index}`}>
                            <TableCell>{row.sticker}</TableCell>
                            <TableCell>{row.serial}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-base">
                    Review Allocation Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Sticker Range
                    </p>
                    <p className="font-medium">
                      {wizard.stickerStart} - {wizard.stickerEnd}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Technology</p>
                    <p className="font-medium">{technologyLabel}</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Product Model
                    </p>
                    <p className="font-medium">
                      {selectedProductModel
                        ? `${selectedProductModel.name} (${selectedProductModel.modelNumber})`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Material Variant
                    </p>
                    <p className="font-medium">{stickerVariantLabel}</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Serial Range</p>
                    <p className="font-medium">
                      {formatSerial(
                        wizard.serialPrefix,
                        parsedSerialStart,
                        serialPadLength,
                      )}{" "}
                      -{" "}
                      {formatSerial(
                        wizard.serialPrefix,
                        parsedSerialEnd,
                        serialPadLength,
                      )}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Total Count</p>
                    <p className="font-medium">
                      {stickerCount.toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {step === 5 ? (
            <Card className="border-emerald-300 bg-emerald-50">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <CheckCircle2Icon className="size-12 text-emerald-600" />
                <p className="text-xl font-semibold">
                  {lastAllocatedCount.toLocaleString()} stickers allocated
                  successfully
                </p>
                <p className="text-sm text-muted-foreground">
                  Allocation ID:{" "}
                  <span className="font-medium">{lastAllocationId}</span>
                </p>
                <Button className="mt-3" onClick={resetWizard}>
                  Start New Allocation
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {wizardError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {wizardError}
            </div>
          ) : null}

          {step < 5 ? (
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={goToPreviousStep}
                disabled={step === 1 || isSubmitting}
              >
                <ChevronLeftIcon className="size-4" />
                Back
              </Button>

              {step === 4 ? (
                <Button
                  onClick={() => void confirmAllocation()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Allocating..." : "Confirm Allocation"}
                  <CheckCircle2Icon className="size-4" />
                </Button>
              ) : (
                <Button onClick={goToNextStep} disabled={isSubmitting}>
                  Next
                  <ChevronRightIcon className="size-4" />
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Allocated</CardDescription>
            <CardTitle>{inventory.totalAllocated.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Bound</CardDescription>
            <CardTitle>{inventory.totalBound.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Activated</CardDescription>
            <CardTitle>{inventory.totalActivated.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Available</CardDescription>
            <CardTitle>{inventory.totalAvailable.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Production Tools</CardTitle>
          <CardDescription>
            Generate print-ready QR assets and NFC encoding exports for sticker
            production.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {hasRealAllocations || allocationHistory.some((row) => isProbablyUuid(row.id)) ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Select Allocation
                </label>
                <select
                  value={productionAllocationId}
                  onChange={(event) => setProductionAllocationId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select an allocation…</option>
                  {allocationHistory
                    .filter((row) => isProbablyUuid(row.id))
                    .map((allocation) => (
                      <option key={allocation.id} value={allocation.id}>
                        {allocation.allocationId} ({allocation.stickerStart}-
                        {allocation.stickerEnd}, {allocation.productModelName})
                      </option>
                    ))}
                </select>
              </div>

              {stickerConfig.mode !== "nfc_only" ? (
                <div className="space-y-3 rounded-md border p-4">
                  <div>
                    <p className="text-sm font-medium">
                      Generate Print-Ready QR Codes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Available for QR Only and NFC + QR sticker modes.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>QR Code Size</span>
                      <select
                        value={qrSizeMm}
                        onChange={(event) =>
                          setQrSizeMm(Number(event.target.value) as 25 | 30 | 35)
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value={25}>25mm</option>
                        <option value={30}>30mm</option>
                        <option value={35}>35mm</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span>Error Correction</span>
                      <select
                        value={qrErrorCorrection}
                        onChange={(event) =>
                          setQrErrorCorrection(
                            event.target.value as "L" | "M" | "Q" | "H",
                          )
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="H">H (30%)</option>
                        <option value="Q">Q (25%)</option>
                        <option value="M">M (15%)</option>
                        <option value="L">L (7%)</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-sm md:col-span-2">
                      <span>Output Format</span>
                      <select
                        value={qrFormat}
                        onChange={(event) =>
                          setQrFormat(
                            event.target.value as "pdf_sheet" | "png_zip" | "csv",
                          )
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="pdf_sheet">PDF (print sheet)</option>
                        <option value="png_zip">Individual PNGs (ZIP)</option>
                        <option value="csv">
                          CSV (number + URL, for label printer)
                        </option>
                      </select>
                    </label>
                  </div>

                  <a
                    href={
                      productionAllocationId && isProbablyUuid(productionAllocationId)
                        ? `/api/manufacturer/stickers/generate-qr?allocation_id=${encodeURIComponent(
                            productionAllocationId,
                          )}&format=${encodeURIComponent(
                            qrFormat,
                          )}&qr_size_mm=${encodeURIComponent(
                            String(qrSizeMm),
                          )}&error_correction=${encodeURIComponent(
                            qrErrorCorrection,
                          )}`
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    className={
                      productionAllocationId && isProbablyUuid(productionAllocationId)
                        ? "inline-flex"
                        : "pointer-events-none inline-flex opacity-60"
                    }
                  >
                    <Button
                      type="button"
                      disabled={
                        !productionAllocationId ||
                        !isProbablyUuid(productionAllocationId)
                      }
                    >
                      Generate & Download
                    </Button>
                  </a>
                </div>
              ) : null}

              {stickerConfig.mode !== "qr_only" ? (
                <div className="space-y-3 rounded-md border p-4">
                  <div>
                    <p className="text-sm font-medium">
                      Generate NFC Encoding File
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Available for NFC + QR and NFC Only sticker modes.
                    </p>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span>Output Format</span>
                    <select
                      value={nfcFormat}
                      onChange={(event) =>
                        setNfcFormat(
                          event.target.value as "ndef_uri_csv" | "nfc_tools_json",
                        )
                      }
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="ndef_uri_csv">
                        NDEF URI CSV (for encoding machines)
                      </option>
                      <option value="nfc_tools_json">
                        NFC Tools JSON (generic)
                      </option>
                    </select>
                  </label>

                  <a
                    href={
                      productionAllocationId && isProbablyUuid(productionAllocationId)
                        ? `/api/manufacturer/stickers/generate-nfc-encoding?allocation_id=${encodeURIComponent(
                            productionAllocationId,
                          )}&format=${encodeURIComponent(nfcFormat)}`
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    className={
                      productionAllocationId && isProbablyUuid(productionAllocationId)
                        ? "inline-flex"
                        : "pointer-events-none inline-flex opacity-60"
                    }
                  >
                    <Button
                      type="button"
                      disabled={
                        !productionAllocationId ||
                        !isProbablyUuid(productionAllocationId)
                      }
                    >
                      Generate & Download
                    </Button>
                  </a>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Create at least one real allocation to unlock production tools.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Allocation History</CardTitle>
          <CardDescription>Past sticker allocation records.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Allocation ID</TableHead>
                <TableHead>Range</TableHead>
                <TableHead>Product Model</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocationHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No allocations recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                allocationHistory.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell>{formatDate(allocation.date)}</TableCell>
                    <TableCell className="font-medium">
                      {allocation.allocationId}
                    </TableCell>
                    <TableCell>
                      {allocation.stickerStart} - {allocation.stickerEnd}
                    </TableCell>
                    <TableCell>
                      {allocation.productModelName || "Unknown Model"}
                    </TableCell>
                    <TableCell className="text-right">
                      {allocation.count.toLocaleString()}
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

"use client"

import { useMemo, useState } from "react"
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  allocationHistorySeed,
  type AllocationHistoryItem,
  productCatalogSeed,
  stickerInventorySeed,
} from "@/lib/mock/manufacturer-dashboard"

type WizardState = {
  stickerStart: string
  stickerEnd: string
  productModelId: string
  serialPrefix: string
  serialStart: string
  serialEnd: string
}

type PreviewRow = {
  type: "row" | "ellipsis"
  sticker: string
  serial: string
}

const stepTitles = [
  "Sticker Range",
  "Product Model",
  "Serial Range",
  "Review",
  "Success",
]

function formatSerial(prefix: string, number: number) {
  return `${prefix}${number.toString().padStart(5, "0")}`
}

function buildPreviewRows(
  stickerStart: number,
  serialStart: number,
  count: number,
  serialPrefix: string
): PreviewRow[] {
  if (count <= 0) {
    return []
  }

  const buildRow = (offset: number): PreviewRow => ({
    type: "row",
    sticker: (stickerStart + offset).toString(),
    serial: formatSerial(serialPrefix, serialStart + offset),
  })

  if (count <= 10) {
    return Array.from({ length: count }, (_, offset) => buildRow(offset))
  }

  return [
    ...Array.from({ length: 5 }, (_, offset) => buildRow(offset)),
    {
      type: "ellipsis",
      sticker: "...",
      serial: "...",
    },
    ...Array.from({ length: 5 }, (_, offset) => buildRow(count - 5 + offset)),
  ]
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default function ManufacturerStickersPage() {
  const [step, setStep] = useState(1)
  const [wizard, setWizard] = useState<WizardState>({
    stickerStart: "",
    stickerEnd: "",
    productModelId: "",
    serialPrefix: "",
    serialStart: "",
    serialEnd: "",
  })
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [allocationHistory, setAllocationHistory] =
    useState<AllocationHistoryItem[]>(allocationHistorySeed)
  const [inventory, setInventory] = useState({
    totalAllocated: stickerInventorySeed.totalAllocated,
    totalBound: stickerInventorySeed.totalBound,
    totalActivated: stickerInventorySeed.totalActivated,
  })
  const [lastAllocationId, setLastAllocationId] = useState("")
  const [lastAllocatedCount, setLastAllocatedCount] = useState(0)

  const parsedStickerStart = Number(wizard.stickerStart)
  const parsedStickerEnd = Number(wizard.stickerEnd)
  const parsedSerialStart = Number(wizard.serialStart)
  const parsedSerialEnd = Number(wizard.serialEnd)

  const stickerCount =
    Number.isFinite(parsedStickerStart) &&
    Number.isFinite(parsedStickerEnd) &&
    parsedStickerEnd >= parsedStickerStart
      ? parsedStickerEnd - parsedStickerStart + 1
      : 0

  const serialCount =
    Number.isFinite(parsedSerialStart) &&
    Number.isFinite(parsedSerialEnd) &&
    parsedSerialEnd >= parsedSerialStart
      ? parsedSerialEnd - parsedSerialStart + 1
      : 0

  const previewRows = useMemo(
    () =>
      buildPreviewRows(
        parsedStickerStart,
        parsedSerialStart,
        Math.min(stickerCount, serialCount),
        wizard.serialPrefix
      ),
    [parsedSerialStart, parsedStickerStart, serialCount, stickerCount, wizard.serialPrefix]
  )

  const selectedProductModel = productCatalogSeed.find(
    (productModel) => productModel.id === wizard.productModelId
  )

  const totalAvailable = inventory.totalAllocated - inventory.totalBound

  const goToNextStep = () => {
    setWizardError(null)

    if (step === 1 && stickerCount <= 0) {
      setWizardError("Enter a valid sticker start and end range.")
      return
    }

    if (step === 2 && !wizard.productModelId) {
      setWizardError("Select a product model before continuing.")
      return
    }

    if (step === 3) {
      if (!wizard.serialPrefix.trim()) {
        setWizardError("Enter a serial prefix before continuing.")
        return
      }

      if (serialCount <= 0) {
        setWizardError("Enter a valid appliance serial range.")
        return
      }

      if (stickerCount !== serialCount) {
        setWizardError(
          "Sticker count and serial count must match for one-to-one binding."
        )
        return
      }
    }

    setStep((current) => Math.min(current + 1, 5))
  }

  const goToPreviousStep = () => {
    setWizardError(null)
    setStep((current) => Math.max(current - 1, 1))
  }

  const confirmAllocation = () => {
    const nextSequence = (allocationHistory.length + 1).toString().padStart(4, "0")
    const now = new Date()
    const allocationId = `ALLOC-${now.getFullYear()}${(now.getMonth() + 1)
      .toString()
      .padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}-${nextSequence}`

    const newAllocation: AllocationHistoryItem = {
      id: `allocation-${Date.now()}`,
      allocationId,
      date: now.toISOString().split("T")[0],
      stickerStart: parsedStickerStart,
      stickerEnd: parsedStickerEnd,
      serialPrefix: wizard.serialPrefix,
      serialStart: parsedSerialStart,
      serialEnd: parsedSerialEnd,
      productModelId: wizard.productModelId,
    }

    setAllocationHistory((current) => [newAllocation, ...current])
    setInventory((current) => ({
      ...current,
      totalAllocated: current.totalAllocated + stickerCount,
      totalBound: current.totalBound + stickerCount,
    }))
    setLastAllocationId(allocationId)
    setLastAllocatedCount(stickerCount)
    setStep(5)
  }

  const resetWizard = () => {
    setWizard({
      stickerStart: "",
      stickerEnd: "",
      productModelId: "",
      serialPrefix: "",
      serialStart: "",
      serialEnd: "",
    })
    setWizardError(null)
    setStep(1)
  }

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
              const stepNumber = index + 1
              const isCurrent = stepNumber === step
              const isCompleted = stepNumber < step

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
                  <p className="text-xs text-muted-foreground">Step {stepNumber}</p>
                  <p className="font-medium">{stepTitle}</p>
                </div>
              )
            })}
          </div>

          {step === 1 ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Sticker Start Number</label>
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
                <label className="text-sm font-medium">Sticker End Number</label>
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
                <label className="text-sm font-medium">Total Sticker Count</label>
                <Input value={stickerCount.toString()} readOnly />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Product Model</label>
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
                <option value="">Choose a product model</option>
                {productCatalogSeed.map((model) => (
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
                  <label className="text-sm font-medium">Serial Start Number</label>
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
                  <label className="text-sm font-medium">Serial End Number</label>
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
                          <TableCell colSpan={2} className="text-muted-foreground">
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
            </div>
          ) : null}

          {step === 4 ? (
            <Card className="bg-muted/20">
              <CardHeader>
                <CardTitle className="text-base">Review Allocation Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Sticker Range</p>
                  <p className="font-medium">
                    {wizard.stickerStart} - {wizard.stickerEnd}
                  </p>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Product Model</p>
                  <p className="font-medium">
                    {selectedProductModel
                      ? `${selectedProductModel.name} (${selectedProductModel.modelNumber})`
                      : "-"}
                  </p>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Serial Range</p>
                  <p className="font-medium">
                    {formatSerial(wizard.serialPrefix, parsedSerialStart)} -{" "}
                    {formatSerial(wizard.serialPrefix, parsedSerialEnd)}
                  </p>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Total Count</p>
                  <p className="font-medium">{stickerCount.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 5 ? (
            <Card className="border-emerald-300 bg-emerald-50">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <CheckCircle2Icon className="size-12 text-emerald-600" />
                <p className="text-xl font-semibold">
                  {lastAllocatedCount.toLocaleString()} stickers allocated successfully
                </p>
                <p className="text-sm text-muted-foreground">
                  Allocation ID: <span className="font-medium">{lastAllocationId}</span>
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
                disabled={step === 1}
              >
                <ChevronLeftIcon className="size-4" />
                Back
              </Button>

              {step === 4 ? (
                <Button onClick={confirmAllocation}>
                  Confirm Allocation
                  <CheckCircle2Icon className="size-4" />
                </Button>
              ) : (
                <Button onClick={goToNextStep}>
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
            <CardTitle>{totalAvailable.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

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
              {allocationHistory.map((allocation) => {
                const productModel = productCatalogSeed.find(
                  (product) => product.id === allocation.productModelId
                )
                const count = allocation.stickerEnd - allocation.stickerStart + 1

                return (
                  <TableRow key={allocation.id}>
                    <TableCell>{formatDate(allocation.date)}</TableCell>
                    <TableCell className="font-medium">
                      {allocation.allocationId}
                    </TableCell>
                    <TableCell>
                      {allocation.stickerStart} - {allocation.stickerEnd}
                    </TableCell>
                    <TableCell>{productModel?.name ?? "Unknown Model"}</TableCell>
                    <TableCell className="text-right">{count}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

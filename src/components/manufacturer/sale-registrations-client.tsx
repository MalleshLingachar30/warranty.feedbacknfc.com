"use client";

import { useState } from "react";
import { ClipboardPlusIcon, Loader2Icon, PlusIcon } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWorkflowLabel } from "@/lib/installation-workflow";

import type { InstallationJobRow, SaleRegistrationRow } from "./types";

type SaleRegistrationFormValues = {
  assetLookupCode: string;
  channel: SaleRegistrationRow["channel"];
  purchaseDate: string;
  dealerName: string;
  distributorName: string;
  sourceDocumentNumber: string;
  sourceLineNumber: string;
  itemCode: string;
  transactionDate: string;
  warehouseCode: string;
};

type SaleRegistrationsClientProps = {
  initialRegistrations: SaleRegistrationRow[];
  initialLookupCode?: string | null;
};

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

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function registrationStatusClass(status: SaleRegistrationRow["status"]) {
  switch (status) {
    case "registered":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "job_created":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "cancelled":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function lifecycleClass(value: SaleRegistrationRow["assetLifecycleState"]) {
  switch (value) {
    case "sold_pending_installation":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "installation_scheduled":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "installation_in_progress":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function emptyFormValues(initialLookupCode: string | null = null): SaleRegistrationFormValues {
  return {
    assetLookupCode: initialLookupCode ?? "",
    channel: "manual_admin",
    purchaseDate: "",
    dealerName: "",
    distributorName: "",
    sourceDocumentNumber: "",
    sourceLineNumber: "",
    itemCode: "",
    transactionDate: "",
    warehouseCode: "",
  };
}

function mergeJobIntoRegistration(
  registration: SaleRegistrationRow,
  job: InstallationJobRow,
): SaleRegistrationRow {
  if (registration.id !== job.saleRegistrationId) {
    return registration;
  }

  return {
    ...registration,
    status: "job_created",
    assetLifecycleState: job.assetLifecycleState,
    installationJob: {
      id: job.id,
      jobNumber: job.jobNumber,
      status: job.status,
      scheduledFor: job.scheduledFor,
      assignedServiceCenterName: job.assignedServiceCenter?.name ?? null,
    },
  };
}

export function SaleRegistrationsClient({
  initialRegistrations,
  initialLookupCode = null,
}: SaleRegistrationsClientProps) {
  const [registrations, setRegistrations] =
    useState<SaleRegistrationRow[]>(initialRegistrations);
  const [dialogOpen, setDialogOpen] = useState(Boolean(initialLookupCode));
  const [formValues, setFormValues] =
    useState<SaleRegistrationFormValues>(emptyFormValues(initialLookupCode));
  const [isSaving, setIsSaving] = useState(false);
  const [creatingJobId, setCreatingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalRegistrations = registrations.length;
  const readyForJobCount = registrations.filter(
    (registration) => registration.status === "registered",
  ).length;
  const jobsCreatedCount = registrations.filter((registration) =>
    Boolean(registration.installationJob),
  ).length;
  const scheduledCount = registrations.filter(
    (registration) => registration.installationJob?.scheduledFor,
  ).length;

  const submitRegistration = async () => {
    const isCartonScanChannel = formValues.channel === "carton_scan";

    if (!formValues.assetLookupCode.trim()) {
      setError(
        isCartonScanChannel
          ? "Carton registration tag code is required for carton scan."
          : "Asset code, tag code, or serial number is required.",
      );
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/manufacturer/sale-registrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetLookupCode: formValues.assetLookupCode,
          channel: formValues.channel,
          purchaseDate: formValues.purchaseDate || null,
          dealerName: formValues.dealerName,
          distributorName: formValues.distributorName,
          salesLine: {
            sourceDocumentNumber: formValues.sourceDocumentNumber,
            sourceLineNumber: formValues.sourceLineNumber,
            itemCode: formValues.itemCode,
            transactionDate: formValues.transactionDate || null,
            warehouseCode: formValues.warehouseCode,
          },
        }),
      });

      const json = (await response.json()) as {
        error?: string;
        registration?: SaleRegistrationRow;
      };

      if (!response.ok || !json.registration) {
        throw new Error(json.error ?? "Unable to save sale registration.");
      }

      setRegistrations((current) => {
        const existingIndex = current.findIndex(
          (registration) => registration.id === json.registration!.id,
        );

        if (existingIndex === -1) {
          return [json.registration!, ...current];
        }

        const next = [...current];
        next[existingIndex] = json.registration!;
        return next;
      });
      setDialogOpen(false);
      setFormValues(emptyFormValues());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save sale registration.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const createInstallationJob = async (registrationId: string) => {
    setCreatingJobId(registrationId);

    try {
      const response = await fetch(
        `/api/manufacturer/sale-registrations/${registrationId}/job`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const json = (await response.json()) as {
        error?: string;
        job?: InstallationJobRow;
      };

      if (!response.ok || !json.job) {
        throw new Error(json.error ?? "Unable to create installation job.");
      }

      setRegistrations((current) =>
        current.map((registration) =>
          mergeJobIntoRegistration(registration, json.job!),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create installation job.",
      );
    } finally {
      setCreatingJobId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Sale Registrations"
        description="Capture serialized commercial handoff before installation and seed the installation queue."
        actions={
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setError(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="size-4" />
                Register Sale
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Register Serialized Sale</DialogTitle>
                <DialogDescription>
                  Capture the sales handoff before installation. Carton Scan
                  accepts only carton registration labels.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Lookup Code</label>
                  <Input
                    value={formValues.assetLookupCode}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        assetLookupCode: event.target.value,
                      }))
                    }
                    placeholder={
                      formValues.channel === "carton_scan"
                        ? "Carton registration tag code"
                        : "AST-..., TAG-..., or serial number"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {formValues.channel === "carton_scan"
                      ? "Carton Scan requires a generated carton registration label. Asset codes, serial numbers, and unit tags are rejected."
                      : "For non-carton channels you can lookup by asset code, serial number, or generated tag code."}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Registration Channel
                  </label>
                  <select
                    value={formValues.channel}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        channel: event.target
                          .value as SaleRegistrationRow["channel"],
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="manual_admin">Manual Admin</option>
                    <option value="carton_scan">Carton Scan</option>
                    <option value="erp_seeded">ERP Seeded</option>
                    <option value="salesman_assisted">Salesman Assisted</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Purchase Date</label>
                  <Input
                    type="date"
                    value={formValues.purchaseDate}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        purchaseDate: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Dealer Name</label>
                  <Input
                    value={formValues.dealerName}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        dealerName: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Distributor Name
                  </label>
                  <Input
                    value={formValues.distributorName}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        distributorName: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Source Document</label>
                  <Input
                    value={formValues.sourceDocumentNumber}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        sourceDocumentNumber: event.target.value,
                      }))
                    }
                    placeholder="Invoice / delivery note"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Line Number</label>
                  <Input
                    value={formValues.sourceLineNumber}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        sourceLineNumber: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Item Code</label>
                  <Input
                    value={formValues.itemCode}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        itemCode: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Warehouse Code</label>
                  <Input
                    value={formValues.warehouseCode}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        warehouseCode: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Sales Line Transaction Date
                  </label>
                  <Input
                    type="date"
                    value={formValues.transactionDate}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        transactionDate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {error ? (
                <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void submitRegistration()}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Registration"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Registrations"
          value={totalRegistrations.toLocaleString()}
          description="Serialized line items captured"
          icon={ClipboardPlusIcon}
        />
        <MetricCard
          title="Ready For Job"
          value={readyForJobCount.toLocaleString()}
          description="Registered without a job"
        />
        <MetricCard
          title="Jobs Created"
          value={jobsCreatedCount.toLocaleString()}
          description="Commercial handoff converted into queue work"
        />
        <MetricCard
          title="Scheduled Jobs"
          value={scheduledCount.toLocaleString()}
          description="Registrations with a scheduled install slot"
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Serialized Registration Queue</CardTitle>
          <CardDescription>
            Each row ties a generated identity to one serialized sales line and
            its installation handoff state.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Sales Line</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead>Installation Job</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No serialized sales have been registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                registrations.map((registration) => (
                  <TableRow key={registration.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{registration.assetCode}</p>
                        <p className="text-xs text-muted-foreground">
                          {registration.productModel.name}
                          {registration.productModel.modelNumber
                            ? ` • ${registration.productModel.modelNumber}`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Serial {registration.serialNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Unit {registration.tags.unitTagCode ?? "-"} | Carton{" "}
                          {registration.tags.cartonTagCode ?? "-"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>
                          {registration.salesLine?.sourceDocumentNumber ?? "-"}
                          {registration.salesLine?.sourceLineNumber
                            ? ` / ${registration.salesLine.sourceLineNumber}`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Item {registration.salesLine?.itemCode ?? "-"} |
                          Warehouse{" "}
                          {registration.salesLine?.warehouseCode ?? "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Sale date{" "}
                          {formatDate(
                            registration.salesLine?.transactionDate ??
                              registration.purchaseDate,
                          )}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="outline">
                          {formatWorkflowLabel(registration.channel)}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Dealer {registration.dealerName ?? "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Distributor {registration.distributorName ?? "-"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge
                          variant="outline"
                          className={registrationStatusClass(
                            registration.status,
                          )}
                        >
                          {formatWorkflowLabel(registration.status)}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(registration.registeredAt)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={lifecycleClass(
                          registration.assetLifecycleState,
                        )}
                      >
                        {formatWorkflowLabel(registration.assetLifecycleState)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {registration.installationJob ? (
                        <div className="space-y-1">
                          <p className="font-medium">
                            {registration.installationJob.jobNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatWorkflowLabel(
                              registration.installationJob.status,
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Center{" "}
                            {registration.installationJob
                              .assignedServiceCenterName ?? "Pending"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Schedule{" "}
                            {formatDateTime(
                              registration.installationJob.scheduledFor,
                            )}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Not created
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {registration.installationJob ? (
                        <span className="text-xs text-muted-foreground">
                          Queue seeded
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void createInstallationJob(registration.id)
                          }
                          disabled={creatingJobId === registration.id}
                        >
                          {creatingJobId === registration.id ? (
                            <>
                              <Loader2Icon className="size-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            "Create Job"
                          )}
                        </Button>
                      )}
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

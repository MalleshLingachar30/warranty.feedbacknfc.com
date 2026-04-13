"use client";

import { useMemo, useState } from "react";
import {
  ACTIVATION_MODES,
  ACTIVATION_TRIGGERS,
  CUSTOMER_CREATION_MODES,
  INSTALLATION_OWNERSHIP_MODES,
  PART_TRACEABILITY_MODES,
  SMALL_PART_TRACKING_MODES,
  type ManufacturerPolicyDefaults,
  type RequiredPhotoPolicy,
} from "@/lib/manufacturer-policy";
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { TagInput } from "@/components/dashboard/tag-input";
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
import { Textarea } from "@/components/ui/textarea";

import type { ManufacturerProductModel } from "./types";

const categoryOptions = [
  "water_purifier",
  "ac",
  "geyser",
  "refrigerator",
  "washing_machine",
  "medical_ventilator",
  "television",
  "kitchen_appliance",
];

type ProductFormValues = {
  name: string;
  category: string;
  subCategory: string;
  modelNumber: string;
  description: string;
  imageUrl: string;
  warrantyDurationMonths: string;
  commonIssues: string[];
  requiredSkills: string[];
  activationMode: NonNullable<ManufacturerProductModel["activationMode"]>;
  installationOwnershipMode: NonNullable<
    ManufacturerProductModel["installationOwnershipMode"]
  >;
  activationTrigger: NonNullable<ManufacturerProductModel["activationTrigger"]>;
  customerCreationMode: NonNullable<
    ManufacturerProductModel["customerCreationMode"]
  >;
  allowCartonSaleRegistration: boolean;
  allowUnitSelfActivation: boolean;
  partTraceabilityMode: NonNullable<
    ManufacturerProductModel["partTraceabilityMode"]
  >;
  smallPartTrackingMode: NonNullable<
    ManufacturerProductModel["smallPartTrackingMode"]
  >;
  customerAcknowledgementRequired: boolean;
  requiredGeoCapture: boolean;
  installationChecklistTemplate: string[];
  commissioningTemplate: string[];
  defaultInstallerSkillTags: string[];
  requiredPhotoPolicy: RequiredPhotoPolicy;
  includedKitDefinition: string;
};

type ProductModelsClientProps = {
  initialModels: ManufacturerProductModel[];
  initialPolicyDefaults: ManufacturerPolicyDefaults;
};

function toFormValues(
  policyDefaults: ManufacturerPolicyDefaults,
  model?: ManufacturerProductModel,
): ProductFormValues {
  const includedKitDefinitionText =
    model?.includedKitDefinition &&
    Object.keys(model.includedKitDefinition).length > 0
      ? JSON.stringify(model.includedKitDefinition, null, 2)
      : "";

  return {
    name: model?.name ?? "",
    category: model?.category ?? categoryOptions[0],
    subCategory: model?.subCategory ?? "",
    modelNumber: model?.modelNumber ?? "",
    description: model?.description ?? "",
    imageUrl: model?.imageUrl ?? "",
    warrantyDurationMonths: model?.warrantyDurationMonths.toString() ?? "12",
    commonIssues: model?.commonIssues ?? [],
    requiredSkills: model?.requiredSkills ?? [],
    activationMode:
      model?.activationMode ?? policyDefaults.defaultActivationMode,
    installationOwnershipMode:
      model?.installationOwnershipMode ??
      policyDefaults.defaultInstallationOwnershipMode,
    activationTrigger:
      model?.activationTrigger ?? policyDefaults.defaultActivationTrigger,
    customerCreationMode:
      model?.customerCreationMode ?? policyDefaults.defaultCustomerCreationMode,
    allowCartonSaleRegistration:
      model?.allowCartonSaleRegistration ??
      policyDefaults.defaultAllowCartonSaleRegistration,
    allowUnitSelfActivation:
      model?.allowUnitSelfActivation ??
      policyDefaults.defaultAllowUnitSelfActivation,
    partTraceabilityMode:
      model?.partTraceabilityMode ?? policyDefaults.defaultPartTraceabilityMode,
    smallPartTrackingMode:
      model?.smallPartTrackingMode ??
      policyDefaults.defaultSmallPartTrackingMode,
    customerAcknowledgementRequired:
      model?.customerAcknowledgementRequired ??
      policyDefaults.defaultAcknowledgementRequired,
    requiredGeoCapture:
      model?.requiredGeoCapture ?? policyDefaults.defaultRequiredGeoCapture,
    installationChecklistTemplate:
      model?.installationChecklistTemplate ??
      policyDefaults.defaultChecklistTemplate,
    commissioningTemplate:
      model?.commissioningTemplate ??
      policyDefaults.defaultCommissioningTemplate,
    defaultInstallerSkillTags:
      model?.defaultInstallerSkillTags ??
      policyDefaults.defaultInstallerSkillTags,
    requiredPhotoPolicy:
      model?.requiredPhotoPolicy ?? policyDefaults.defaultRequiredPhotoPolicy,
    includedKitDefinition: includedKitDefinitionText,
  };
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPolicyOption(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ProductModelsClient({
  initialModels,
  initialPolicyDefaults,
}: ProductModelsClientProps) {
  const [models, setModels] =
    useState<ManufacturerProductModel[]>(initialModels);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [formValues, setFormValues] =
    useState<ProductFormValues>(toFormValues(initialPolicyDefaults));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const editingModel = useMemo(
    () => models.find((model) => model.id === editingModelId),
    [editingModelId, models],
  );

  const resetForm = () => {
    setEditingModelId(null);
    setFormValues(toFormValues(initialPolicyDefaults));
    setFormError(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (model: ManufacturerProductModel) => {
    setEditingModelId(model.id);
    setFormValues(toFormValues(initialPolicyDefaults, model));
    setFormError(null);
    setDialogOpen(true);
  };

  const uploadModelImage = async (file: File) => {
    setFormError(null);
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/photo", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as {
        error?: string;
        url?: string | null;
      };

      if (!response.ok || !json.url) {
        throw new Error(json.error ?? "Unable to upload image.");
      }

      setFormValues((current) => ({
        ...current,
        imageUrl: json.url ?? "",
      }));
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to upload image.",
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  const saveModel = async () => {
    let includedKitDefinitionPayload: Record<string, unknown> = {};

    if (formValues.includedKitDefinition.trim()) {
      try {
        const parsed = JSON.parse(formValues.includedKitDefinition) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(
            "Included kit definition must be a JSON object when provided.",
          );
        }

        includedKitDefinitionPayload = parsed as Record<string, unknown>;
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "Included kit definition JSON is invalid.",
        );
        return;
      }
    }

    const payload = {
      name: formValues.name.trim(),
      category: formValues.category,
      subCategory: formValues.subCategory.trim(),
      modelNumber: formValues.modelNumber.trim(),
      description: formValues.description.trim(),
      imageUrl: formValues.imageUrl.trim(),
      warrantyDurationMonths: Number(formValues.warrantyDurationMonths),
      commonIssues: formValues.commonIssues,
      requiredSkills: formValues.requiredSkills,
      activationMode: formValues.activationMode,
      installationOwnershipMode: formValues.installationOwnershipMode,
      activationTrigger: formValues.activationTrigger,
      customerCreationMode: formValues.customerCreationMode,
      allowCartonSaleRegistration: formValues.allowCartonSaleRegistration,
      allowUnitSelfActivation: formValues.allowUnitSelfActivation,
      partTraceabilityMode: formValues.partTraceabilityMode,
      smallPartTrackingMode: formValues.smallPartTrackingMode,
      customerAcknowledgementRequired:
        formValues.customerAcknowledgementRequired,
      installationChecklistTemplate: formValues.installationChecklistTemplate,
      commissioningTemplate: formValues.commissioningTemplate,
      requiredPhotoPolicy: formValues.requiredPhotoPolicy,
      requiredGeoCapture: formValues.requiredGeoCapture,
      defaultInstallerSkillTags: formValues.defaultInstallerSkillTags,
      includedKitDefinition: includedKitDefinitionPayload,
    };

    if (!payload.name || !payload.category || !payload.modelNumber) {
      setFormError("Name, category, and model number are required.");
      return;
    }

    if (
      !Number.isInteger(payload.warrantyDurationMonths) ||
      payload.warrantyDurationMonths < 1
    ) {
      setFormError("Warranty duration must be a positive whole number.");
      return;
    }

    if (
      payload.activationMode === "installation_driven" &&
      payload.installationChecklistTemplate.length === 0
    ) {
      setFormError(
        "Installation-driven models must include at least one checklist step.",
      );
      return;
    }

    if (
      payload.activationMode === "installation_driven" &&
      payload.partTraceabilityMode === "none"
    ) {
      setFormError(
        "Installation-driven models cannot use 'None' part traceability.",
      );
      return;
    }

    if (
      payload.activationMode === "installation_driven" &&
      (!payload.requiredPhotoPolicy.requireBeforePhoto ||
        !payload.requiredPhotoPolicy.requireAfterPhoto ||
        payload.requiredPhotoPolicy.minimumPhotoCount < 2)
    ) {
      setFormError(
        "Installation-driven models must require before/after photos and at least 2 photos.",
      );
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const endpoint = editingModelId
        ? `/api/manufacturer/product-model/${editingModelId}`
        : "/api/manufacturer/product-model";

      const response = await fetch(endpoint, {
        method: editingModelId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = (await response.json()) as {
        error?: string;
        model?: ManufacturerProductModel;
      };

      if (!response.ok || !json.model) {
        throw new Error(json.error ?? "Unable to save product model.");
      }

      setModels((current) => {
        if (editingModelId) {
          return current.map((model) =>
            model.id === editingModelId ? json.model! : model,
          );
        }

        return [json.model!, ...current];
      });

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save product model.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteModel = async (model: ManufacturerProductModel) => {
    const shouldDelete = window.confirm(
      `Delete ${model.name}? This action cannot be undone.`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(model.id);

    try {
      const response = await fetch(
        `/api/manufacturer/product-model/${model.id}`,
        {
          method: "DELETE",
        },
      );

      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(json.error ?? "Unable to delete product model.");
      }

      setModels((current) => current.filter((item) => item.id !== model.id));
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to delete product model.",
      );
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Product Models"
        description="Manage the manufacturer product model catalog used for warranty allocation."
        actions={
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);

              if (!open) {
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <PlusIcon className="size-4" />
                Add Product Model
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {editingModel ? "Edit Product Model" : "Add Product Model"}
                </DialogTitle>
                <DialogDescription>
                  Capture model details for warranty activation and allocation.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={formValues.name}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Model name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <select
                    value={formValues.category}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {formatCategory(category)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Sub Category</label>
                  <Input
                    value={formValues.subCategory}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        subCategory: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Model Number</label>
                  <Input
                    value={formValues.modelNumber}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        modelNumber: event.target.value,
                      }))
                    }
                    placeholder="e.g. AC-INV-15-AX"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={formValues.description}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe this model"
                    className="min-h-24"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Image URL</label>
                  <Input
                    value={formValues.imageUrl}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        imageUrl: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                  />
                  <div className="flex items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";

                          if (!file) {
                            return;
                          }

                          void uploadModelImage(file);
                        }}
                      />
                      <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                        {isUploadingImage ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <UploadIcon className="size-4" />
                        )}
                        {isUploadingImage ? "Uploading..." : "Upload Image"}
                      </span>
                    </label>
                    {formValues.imageUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFormValues((current) => ({
                            ...current,
                            imageUrl: "",
                          }))
                        }
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                  {formValues.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={formValues.imageUrl}
                      alt="Product model preview"
                      className="h-28 w-full rounded-md border object-cover"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Upload an image or paste an image URL. This image appears
                      on the customer warranty activation screen.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Warranty Duration (months)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={formValues.warrantyDurationMonths}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        warrantyDurationMonths: event.target.value,
                      }))
                    }
                  />
                </div>

                <TagInput
                  label="Common Issues"
                  placeholder="Press Enter to add common issue"
                  value={formValues.commonIssues}
                  onChange={(next) =>
                    setFormValues((current) => ({
                      ...current,
                      commonIssues: next,
                    }))
                  }
                />

                <TagInput
                  label="Required Skills"
                  placeholder="Press Enter to add required skill"
                  value={formValues.requiredSkills}
                  onChange={(next) =>
                    setFormValues((current) => ({
                      ...current,
                      requiredSkills: next,
                    }))
                  }
                />

                <div className="space-y-3 rounded-md border p-3 md:col-span-2">
                  <p className="text-sm font-semibold">Activation Policy</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>Activation Mode</span>
                      <select
                        value={formValues.activationMode}
                        onChange={(event) =>
                          setFormValues((current) => {
                            const nextMode = event.target
                              .value as ProductFormValues["activationMode"];

                            if (nextMode !== "installation_driven") {
                              return {
                                ...current,
                                activationMode: nextMode,
                              };
                            }

                            return {
                              ...current,
                              activationMode: "installation_driven",
                              activationTrigger:
                                "installation_report_submission",
                              customerCreationMode: "on_installation",
                              allowUnitSelfActivation: false,
                              customerAcknowledgementRequired: true,
                              partTraceabilityMode:
                                current.partTraceabilityMode === "none"
                                  ? "pack_or_kit"
                                  : current.partTraceabilityMode,
                              requiredPhotoPolicy: {
                                ...current.requiredPhotoPolicy,
                                requireBeforePhoto: true,
                                requireAfterPhoto: true,
                                minimumPhotoCount: Math.max(
                                  2,
                                  current.requiredPhotoPolicy.minimumPhotoCount,
                                ),
                              },
                            };
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {ACTIVATION_MODES.map((option) => (
                          <option key={option} value={option}>
                            {formatPolicyOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span>Installer Authority</span>
                      <select
                        value={formValues.installationOwnershipMode}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            installationOwnershipMode: event.target
                              .value as ProductFormValues["installationOwnershipMode"],
                          }))
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {INSTALLATION_OWNERSHIP_MODES.map((option) => (
                          <option key={option} value={option}>
                            {formatPolicyOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span>Activation Trigger</span>
                      <select
                        value={formValues.activationTrigger}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            activationTrigger: event.target
                              .value as ProductFormValues["activationTrigger"],
                          }))
                        }
                        disabled={
                          formValues.activationMode === "installation_driven"
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {ACTIVATION_TRIGGERS.map((option) => (
                          <option key={option} value={option}>
                            {formatPolicyOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span>Customer Creation Mode</span>
                      <select
                        value={formValues.customerCreationMode}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            customerCreationMode: event.target
                              .value as ProductFormValues["customerCreationMode"],
                          }))
                        }
                        disabled={
                          formValues.activationMode === "installation_driven"
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {CUSTOMER_CREATION_MODES.map((option) => (
                          <option key={option} value={option}>
                            {formatPolicyOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span>Part Traceability Mode</span>
                      <select
                        value={formValues.partTraceabilityMode}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            partTraceabilityMode: event.target
                              .value as ProductFormValues["partTraceabilityMode"],
                          }))
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {PART_TRACEABILITY_MODES.map((option) => (
                          <option key={option} value={option}>
                            {formatPolicyOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span>Small Part Tracking Mode</span>
                      <select
                        value={formValues.smallPartTrackingMode}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            smallPartTrackingMode: event.target
                              .value as ProductFormValues["smallPartTrackingMode"],
                          }))
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {SMALL_PART_TRACKING_MODES.map((option) => (
                          <option key={option} value={option}>
                            {formatPolicyOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <span>Allow Carton Sale Registration</span>
                      <input
                        type="checkbox"
                        checked={formValues.allowCartonSaleRegistration}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            allowCartonSaleRegistration: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <span>Allow Unit Self-Activation</span>
                      <input
                        type="checkbox"
                        checked={formValues.allowUnitSelfActivation}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            allowUnitSelfActivation: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <span>Require Customer Acknowledgement</span>
                      <input
                        type="checkbox"
                        checked={formValues.customerAcknowledgementRequired}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            customerAcknowledgementRequired:
                              event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <span>Require Geo Capture</span>
                      <input
                        type="checkbox"
                        checked={formValues.requiredGeoCapture}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            requiredGeoCapture: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                    </label>
                  </div>

                  <TagInput
                    label="Installation Checklist Template"
                    placeholder="Press Enter to add checklist item"
                    value={formValues.installationChecklistTemplate}
                    onChange={(next) =>
                      setFormValues((current) => ({
                        ...current,
                        installationChecklistTemplate: next,
                      }))
                    }
                  />

                  <TagInput
                    label="Commissioning Template"
                    placeholder="Press Enter to add commissioning field"
                    value={formValues.commissioningTemplate}
                    onChange={(next) =>
                      setFormValues((current) => ({
                        ...current,
                        commissioningTemplate: next,
                      }))
                    }
                  />

                  <TagInput
                    label="Default Installer Skill Tags"
                    placeholder="Press Enter to add installer skill tag"
                    value={formValues.defaultInstallerSkillTags}
                    onChange={(next) =>
                      setFormValues((current) => ({
                        ...current,
                        defaultInstallerSkillTags: next,
                      }))
                    }
                  />

                  <div className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>Require Before Photo</span>
                      <input
                        type="checkbox"
                        checked={formValues.requiredPhotoPolicy.requireBeforePhoto}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            requiredPhotoPolicy: {
                              ...current.requiredPhotoPolicy,
                              requireBeforePhoto: event.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>Require After Photo</span>
                      <input
                        type="checkbox"
                        checked={formValues.requiredPhotoPolicy.requireAfterPhoto}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            requiredPhotoPolicy: {
                              ...current.requiredPhotoPolicy,
                              requireAfterPhoto: event.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span>Minimum Photo Count</span>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={formValues.requiredPhotoPolicy.minimumPhotoCount}
                        onChange={(event) => {
                          const parsed = Number.parseInt(
                            event.target.value || "0",
                            10,
                          );
                          const safeValue = Number.isFinite(parsed)
                            ? parsed
                            : 0;

                          setFormValues((current) => ({
                            ...current,
                            requiredPhotoPolicy: {
                              ...current.requiredPhotoPolicy,
                              minimumPhotoCount: Math.min(
                                20,
                                Math.max(0, safeValue),
                              ),
                            },
                          }));
                        }}
                      />
                    </label>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span>Included Kit Definition (JSON, optional)</span>
                    <Textarea
                      value={formValues.includedKitDefinition}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          includedKitDefinition: event.target.value,
                        }))
                      }
                      placeholder='{"kitCode":"INSTALL-KIT-01","parts":[{"partCode":"P-1001","quantity":2}]}'
                      className="min-h-28 font-mono text-xs"
                    />
                  </label>
                </div>
              </div>

              {formError ? (
                <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
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
                  onClick={saveModel}
                  disabled={isSaving || isUploadingImage}
                >
                  {isSaving
                    ? "Saving..."
                    : isUploadingImage
                      ? "Uploading Image..."
                      : editingModel
                        ? "Save Changes"
                        : "Create Product Model"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Product Catalog</CardTitle>
          <CardDescription>
            All manufacturer models with warranty metadata and active unit
            volume.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Model Number</TableHead>
                <TableHead>Activation</TableHead>
                <TableHead>Warranty</TableHead>
                <TableHead className="text-right">Total Units</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No product models found. Add your first model to begin
                    allocations.
                  </TableCell>
                </TableRow>
              ) : (
                models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="max-w-72 truncate font-medium">
                      {model.name}
                    </TableCell>
                    <TableCell>{formatCategory(model.category)}</TableCell>
                    <TableCell>{model.modelNumber || "-"}</TableCell>
                    <TableCell>
                      {formatPolicyOption(model.activationMode ?? "plug_and_play")}
                    </TableCell>
                    <TableCell>{model.warrantyDurationMonths} months</TableCell>
                    <TableCell className="text-right">
                      {model.totalUnits.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(model)}
                        >
                          <PencilIcon className="size-4" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void deleteModel(model)}
                          disabled={isDeletingId === model.id}
                        >
                          <Trash2Icon className="size-4" />
                          {isDeletingId === model.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
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

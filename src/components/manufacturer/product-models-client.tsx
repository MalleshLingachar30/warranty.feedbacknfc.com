"use client";

import { useMemo, useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

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
};

type ProductModelsClientProps = {
  initialModels: ManufacturerProductModel[];
};

function toFormValues(model?: ManufacturerProductModel): ProductFormValues {
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
  };
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ProductModelsClient({
  initialModels,
}: ProductModelsClientProps) {
  const [models, setModels] =
    useState<ManufacturerProductModel[]>(initialModels);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [formValues, setFormValues] =
    useState<ProductFormValues>(toFormValues());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const editingModel = useMemo(
    () => models.find((model) => model.id === editingModelId),
    [editingModelId, models],
  );

  const resetForm = () => {
    setEditingModelId(null);
    setFormValues(toFormValues());
    setFormError(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (model: ManufacturerProductModel) => {
    setEditingModelId(model.id);
    setFormValues(toFormValues(model));
    setFormError(null);
    setDialogOpen(true);
  };

  const saveModel = async () => {
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
                <Button onClick={saveModel} disabled={isSaving}>
                  {isSaving
                    ? "Saving..."
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
                <TableHead>Warranty</TableHead>
                <TableHead className="text-right">Total Units</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
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

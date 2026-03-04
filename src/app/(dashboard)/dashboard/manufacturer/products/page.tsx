"use client"

import { useMemo, useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import { TagInput } from "@/components/dashboard/tag-input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  type ProductModel,
  productCatalogSeed,
} from "@/lib/mock/manufacturer-dashboard"

type ProductFormValues = {
  name: string
  category: string
  subCategory: string
  modelNumber: string
  description: string
  imageFileName: string
  warrantyDurationMonths: string
  totalUnits: string
  commonIssues: string[]
  requiredSkills: string[]
}

const categoryOptions = [
  "Air Conditioner",
  "Washing Machine",
  "Refrigerator",
  "Kitchen Appliance",
  "Water Purifier",
  "Television",
]

function toFormValues(model?: ProductModel): ProductFormValues {
  return {
    name: model?.name ?? "",
    category: model?.category ?? categoryOptions[0],
    subCategory: model?.subCategory ?? "",
    modelNumber: model?.modelNumber ?? "",
    description: model?.description ?? "",
    imageFileName: model?.imageUrl ?? "",
    warrantyDurationMonths: model?.warrantyDurationMonths.toString() ?? "24",
    totalUnits: model?.totalUnits.toString() ?? "0",
    commonIssues: model?.commonIssues ?? [],
    requiredSkills: model?.requiredSkills ?? [],
  }
}

export default function ManufacturerProductsPage() {
  const [products, setProducts] = useState<ProductModel[]>(productCatalogSeed)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<ProductFormValues>(toFormValues())

  const editingProduct = useMemo(
    () => products.find((product) => product.id === editingProductId),
    [editingProductId, products]
  )

  const resetForm = () => {
    setEditingProductId(null)
    setFormValues(toFormValues())
  }

  const openCreateDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (product: ProductModel) => {
    setEditingProductId(product.id)
    setFormValues(toFormValues(product))
    setDialogOpen(true)
  }

  const onSaveProduct = () => {
    const payload: ProductModel = {
      id: editingProductId ?? `pm-${Date.now()}`,
      name: formValues.name.trim(),
      category: formValues.category,
      subCategory: formValues.subCategory.trim(),
      modelNumber: formValues.modelNumber.trim(),
      description: formValues.description.trim(),
      imageUrl: formValues.imageFileName || "/file.svg",
      warrantyDurationMonths: Number(formValues.warrantyDurationMonths) || 0,
      totalUnits: Number(formValues.totalUnits) || 0,
      commonIssues: formValues.commonIssues,
      requiredSkills: formValues.requiredSkills,
    }

    if (!payload.name || !payload.modelNumber) {
      return
    }

    setProducts((current) => {
      if (editingProductId) {
        return current.map((item) => (item.id === editingProductId ? payload : item))
      }

      return [payload, ...current]
    })

    setDialogOpen(false)
    resetForm()
  }

  return (
    <div>
      <PageHeader
        title="Product Models"
        description="Manage the manufacturer product model catalog used for warranty allocation."
        actions={
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) {
                resetForm()
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
                  {editingProduct ? "Edit Product Model" : "Add Product Model"}
                </DialogTitle>
                <DialogDescription>
                  Capture complete model details for warranty operations.
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
                        {category}
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
                    placeholder="Sub-category"
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
                  <textarea
                    value={formValues.description}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe this model"
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Image Upload</label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) {
                        return
                      }

                      setFormValues((current) => ({
                        ...current,
                        imageFileName: file.name,
                      }))
                    }}
                  />
                  {formValues.imageFileName ? (
                    <p className="text-xs text-muted-foreground">
                      Selected: {formValues.imageFileName}
                    </p>
                  ) : null}
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

                <div className="space-y-2">
                  <label className="text-sm font-medium">Total Units</label>
                  <Input
                    type="number"
                    min={0}
                    value={formValues.totalUnits}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        totalUnits: event.target.value,
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

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={onSaveProduct}>
                  {editingProduct ? "Save Changes" : "Create Product Model"}
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
            All manufacturer models with warranty metadata and unit volume.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Model Number</TableHead>
                <TableHead>Warranty Duration</TableHead>
                <TableHead className="text-right">Total Units</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="max-w-72 truncate font-medium">
                    {product.name}
                  </TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{product.modelNumber}</TableCell>
                  <TableCell>{product.warrantyDurationMonths} months</TableCell>
                  <TableCell className="text-right">
                    {product.totalUnits.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(product)}
                      >
                        <PencilIcon className="size-4" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setProducts((current) =>
                            current.filter((item) => item.id !== product.id)
                          )
                        }
                      >
                        <Trash2Icon className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

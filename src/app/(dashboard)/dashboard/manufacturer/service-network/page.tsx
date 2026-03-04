"use client"

import { Fragment, useState } from "react"
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
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
  type ServiceCenter,
  serviceCentersSeed,
} from "@/lib/mock/manufacturer-dashboard"

export default function ServiceNetworkPage() {
  const [centers, setCenters] = useState(serviceCentersSeed)
  const [expandedCenterId, setExpandedCenterId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newCenter, setNewCenter] = useState({
    name: "",
    city: "",
    categories: "",
  })

  const addNewCenter = () => {
    if (!newCenter.name.trim() || !newCenter.city.trim()) {
      return
    }

    const center: ServiceCenter = {
      id: `sc-${Date.now()}`,
      name: newCenter.name.trim(),
      city: newCenter.city.trim(),
      supportedCategories: newCenter.categories
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      rating: 0,
      totalJobsCompleted: 0,
      technicians: [],
      performance: {
        avgResolutionHours: 0,
        claimAccuracy: 0,
        customerSatisfaction: 0,
      },
    }

    setCenters((current) => [center, ...current])
    setDialogOpen(false)
    setNewCenter({ name: "", city: "", categories: "" })
  }

  return (
    <div>
      <PageHeader
        title="Service Network"
        description="Manage authorized service centers and monitor performance."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="size-4" />
                Authorize New Center
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Authorize Service Center</DialogTitle>
                <DialogDescription>
                  Add a new service center to the authorized network.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Center Name</label>
                  <Input
                    value={newCenter.name}
                    onChange={(event) =>
                      setNewCenter((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">City</label>
                  <Input
                    value={newCenter.city}
                    onChange={(event) =>
                      setNewCenter((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Supported Categories (comma-separated)
                  </label>
                  <Input
                    value={newCenter.categories}
                    onChange={(event) =>
                      setNewCenter((current) => ({
                        ...current,
                        categories: event.target.value,
                      }))
                    }
                    placeholder="Air Conditioner, Refrigerator"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={addNewCenter}>Authorize Center</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Authorized Service Centers</CardTitle>
          <CardDescription>
            Expand any row to inspect technicians and service quality metrics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Supported Categories</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">Total Jobs Completed</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centers.map((center) => {
                const isExpanded = expandedCenterId === center.id

                return (
                  <Fragment key={center.id}>
                    <TableRow>
                      <TableCell className="font-medium">{center.name}</TableCell>
                      <TableCell>{center.city}</TableCell>
                      <TableCell className="max-w-80 truncate">
                        {center.supportedCategories.join(", ") || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {center.rating.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {center.totalJobsCompleted.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedCenterId((current) =>
                              current === center.id ? null : center.id
                            )
                          }
                        >
                          {isExpanded ? (
                            <>
                              Hide
                              <ChevronUpIcon className="size-4" />
                            </>
                          ) : (
                            <>
                              View
                              <ChevronDownIcon className="size-4" />
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {isExpanded ? (
                      <TableRow key={`${center.id}-expanded`}>
                        <TableCell colSpan={6} className="p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <Card className="bg-muted/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Technicians</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {center.technicians.length > 0 ? (
                                  center.technicians.map((tech) => (
                                    <div
                                      key={tech.id}
                                      className="rounded-md border bg-background p-3"
                                    >
                                      <p className="text-sm font-medium">{tech.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {tech.skillset.join(", ")}
                                      </p>
                                      <p className="mt-2 text-xs">
                                        Jobs: {tech.jobsCompleted} | First-time fix: {" "}
                                        {tech.firstTimeFixRate}%
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    No technicians added yet.
                                  </p>
                                )}
                              </CardContent>
                            </Card>

                            <Card className="bg-muted/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">
                                  Performance Metrics
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3 text-sm">
                                <div className="rounded-md border bg-background p-3">
                                  Average Resolution Time: {" "}
                                  <span className="font-medium">
                                    {center.performance.avgResolutionHours} hrs
                                  </span>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                  Claim Accuracy: {" "}
                                  <span className="font-medium">
                                    {center.performance.claimAccuracy}%
                                  </span>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                  Customer Satisfaction: {" "}
                                  <span className="font-medium">
                                    {center.performance.customerSatisfaction.toFixed(1)}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

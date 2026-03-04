"use client";

import { Fragment, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
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

import type { ServiceCenterRow } from "./types";

type ServiceNetworkClientProps = {
  initialCenters: ServiceCenterRow[];
};

export function ServiceNetworkClient({
  initialCenters,
}: ServiceNetworkClientProps) {
  const [centers, setCenters] = useState<ServiceCenterRow[]>(initialCenters);
  const [expandedCenterId, setExpandedCenterId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCenter, setNewCenter] = useState({
    name: "",
    city: "",
    categories: "",
    phone: "",
    email: "",
  });

  const authorizeCenter = async () => {
    const name = newCenter.name.trim();
    const city = newCenter.city.trim();

    if (!name || !city) {
      setError("Center name and city are required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/manufacturer/service-center", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          city,
          phone: newCenter.phone,
          email: newCenter.email,
          supportedCategories: newCenter.categories
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      const json = (await response.json()) as {
        error?: string;
        center?: ServiceCenterRow;
      };

      if (!response.ok || !json.center) {
        throw new Error(json.error ?? "Unable to authorize service center.");
      }

      setCenters((current) => [json.center!, ...current]);
      setDialogOpen(false);
      setNewCenter({
        name: "",
        city: "",
        categories: "",
        phone: "",
        email: "",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to authorize service center.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Service Network"
        description="Manage authorized service centers and monitor performance."
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
                Authorize New Center
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Authorize Service Center</DialogTitle>
                <DialogDescription>
                  Add a new service center to your authorized warranty network.
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
                    placeholder="ac, refrigerator, water_purifier"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={newCenter.phone}
                      onChange={(event) =>
                        setNewCenter((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      value={newCenter.email}
                      onChange={(event) =>
                        setNewCenter((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </div>
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
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void authorizeCenter()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Authorizing..." : "Authorize Center"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Authorized Service Centers</CardTitle>
          <CardDescription>
            Expand any row to inspect technicians and performance metrics.
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
                <TableHead className="text-right">
                  Total Jobs Completed
                </TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No service centers authorized yet.
                  </TableCell>
                </TableRow>
              ) : (
                centers.map((center) => {
                  const isExpanded = expandedCenterId === center.id;

                  return (
                    <Fragment key={center.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          {center.name}
                        </TableCell>
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
                                current === center.id ? null : center.id,
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
                        <TableRow>
                          <TableCell colSpan={6} className="p-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Card className="bg-muted/20">
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base">
                                    Technicians
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  {center.technicians.length > 0 ? (
                                    center.technicians.map((tech) => (
                                      <div
                                        key={tech.id}
                                        className="rounded-md border bg-background p-3"
                                      >
                                        <p className="text-sm font-medium">
                                          {tech.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {tech.skillset.join(", ")}
                                        </p>
                                        <p className="mt-2 text-xs">
                                          Jobs: {tech.jobsCompleted} | Rating:{" "}
                                          {tech.rating.toFixed(1)}
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
                                    Average Resolution Time:{" "}
                                    <span className="font-medium">
                                      {center.performance.avgResolutionHours.toFixed(
                                        1,
                                      )}{" "}
                                      hrs
                                    </span>
                                  </div>
                                  <div className="rounded-md border bg-background p-3">
                                    Claim Accuracy:{" "}
                                    <span className="font-medium">
                                      {center.performance.claimAccuracy}%
                                    </span>
                                  </div>
                                  <div className="rounded-md border bg-background p-3">
                                    Customer Satisfaction:{" "}
                                    <span className="font-medium">
                                      {center.performance.customerSatisfaction.toFixed(
                                        1,
                                      )}
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

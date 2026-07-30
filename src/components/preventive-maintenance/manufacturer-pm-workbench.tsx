"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import type {
  PreventiveMaintenanceCadenceType,
  PreventiveMaintenanceEventStatus,
  PreventiveMaintenanceEventView,
  PreventiveMaintenancePlanView,
  PreventiveMaintenanceProductModelOption,
  PreventiveMaintenanceServiceCenterOption,
  PreventiveMaintenanceTechnicianOption,
} from "@/components/preventive-maintenance/types";

type ManufacturerPmWorkbenchProps = {
  initialPlans: PreventiveMaintenancePlanView[];
  initialEvents: PreventiveMaintenanceEventView[];
  productModels: PreventiveMaintenanceProductModelOption[];
  serviceCenters: PreventiveMaintenanceServiceCenterOption[];
  technicians: PreventiveMaintenanceTechnicianOption[];
};

type PlanFormState = {
  productModelId: string;
  name: string;
  eventType: "preventive_maintenance" | "calibration";
  cadenceType: PreventiveMaintenanceCadenceType;
  intervalDays: string;
  monthOffsets: string;
  dueSoonThresholdDays: string;
  customerAcknowledgementRequired: boolean;
  checklistTemplate: string;
  calibrationTemplate: string;
};

type EventPlannerState = {
  eventId: string;
  assignedServiceCenterId: string;
  assignedTechnicianId: string;
  scheduledFor: string;
  cancellationReason: string;
};

const EMPTY_PLAN_FORM: PlanFormState = {
  productModelId: "",
  name: "",
  eventType: "preventive_maintenance",
  cadenceType: "interval_days",
  intervalDays: "180",
  monthOffsets: "6, 12",
  dueSoonThresholdDays: "14",
  customerAcknowledgementRequired: false,
  checklistTemplate: "Visual inspection\nClean filters\nCheck operating noise",
  calibrationTemplate: "",
};

function statusClass(status: PreventiveMaintenanceEventStatus | string) {
  switch (status) {
    case "due":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "due_soon":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "overdue":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "scheduled":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "in_progress":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMonthOffsets(value: string) {
  return value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
}

function buildCadenceConfig(form: PlanFormState) {
  if (form.cadenceType === "interval_days") {
    return {
      intervalDays: Math.max(1, Number.parseInt(form.intervalDays, 10) || 180),
    };
  }

  if (form.cadenceType === "month_offsets") {
    return {
      monthOffsets: parseMonthOffsets(form.monthOffsets),
    };
  }

  return {};
}

function eventSortRank(event: PreventiveMaintenanceEventView) {
  if (event.displayStatus === "overdue") {
    return 0;
  }

  if (event.displayStatus === "due_soon") {
    return 1;
  }

  if (event.status === "due" || event.status === "scheduled") {
    return 2;
  }

  if (event.status === "in_progress") {
    return 3;
  }

  if (event.status === "completed") {
    return 4;
  }

  return 5;
}

export function ManufacturerPmWorkbench({
  initialPlans,
  initialEvents,
  productModels,
  serviceCenters,
  technicians,
}: ManufacturerPmWorkbenchProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [events, setEvents] = useState(initialEvents);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormState>(() => ({
    ...EMPTY_PLAN_FORM,
    productModelId: productModels[0]?.id ?? "",
  }));
  const [eventPlanner, setEventPlanner] = useState<EventPlannerState | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const activePlanCount = plans.filter((plan) => plan.status === "active").length;
  const dueCount = events.filter((event) =>
    ["due", "due_soon", "overdue"].includes(event.displayStatus),
  ).length;
  const scheduledCount = events.filter(
    (event) => event.status === "scheduled",
  ).length;
  const completedCount = events.filter(
    (event) => event.status === "completed",
  ).length;

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const rankDelta = eventSortRank(left) - eventSortRank(right);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        return (
          new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()
        );
      }),
    [events],
  );

  const plannerEvent = eventPlanner
    ? events.find((event) => event.id === eventPlanner.eventId) ?? null
    : null;

  const availableTechnicians = technicians.filter((technician) => {
    if (!eventPlanner?.assignedServiceCenterId) {
      return true;
    }

    return technician.serviceCenterId === eventPlanner.assignedServiceCenterId;
  });

  const refreshEvents = async () => {
    const response = await fetch(
      "/api/manufacturer/preventive-maintenance/events?limit=200",
      { method: "GET" },
    );
    const body = (await response.json()) as {
      events?: PreventiveMaintenanceEventView[];
      error?: string;
    };

    if (!response.ok || !body.events) {
      throw new Error(body.error ?? "Unable to refresh maintenance events.");
    }

    setEvents(body.events);
  };

  const createPlan = async () => {
    setError(null);
    setIsSavingPlan(true);

    try {
      const checklistTemplate = splitLines(planForm.checklistTemplate);
      const calibrationTemplate = splitLines(planForm.calibrationTemplate);
      const response = await fetch(
        "/api/manufacturer/preventive-maintenance/plans",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productModelId: planForm.productModelId,
            name: planForm.name,
            eventType: planForm.eventType,
            cadenceType: planForm.cadenceType,
            cadenceConfig: buildCadenceConfig(planForm),
            dueSoonThresholdDays:
              Number.parseInt(planForm.dueSoonThresholdDays, 10) || 14,
            customerAcknowledgementRequired:
              planForm.customerAcknowledgementRequired,
            checklistTemplate,
            calibrationTemplate,
          }),
        },
      );

      const body = (await response.json()) as {
        plan?: PreventiveMaintenancePlanView;
        error?: string;
      };

      if (!response.ok || !body.plan) {
        throw new Error(body.error ?? "Unable to create maintenance plan.");
      }

      setPlans((current) => [body.plan!, ...current]);
      setPlanDialogOpen(false);
      setPlanForm({
        ...EMPTY_PLAN_FORM,
        productModelId: productModels[0]?.id ?? "",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create maintenance plan.",
      );
    } finally {
      setIsSavingPlan(false);
    }
  };

  const regenerateEvents = async () => {
    setError(null);
    setIsRegenerating(true);

    try {
      const response = await fetch(
        "/api/manufacturer/preventive-maintenance/events/regenerate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxEventsWithoutWarrantyEnd: 4,
            limit: 200,
          }),
        },
      );
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to regenerate PM events.");
      }

      await refreshEvents();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to regenerate PM events.",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const openEventPlanner = (event: PreventiveMaintenanceEventView) => {
    setEventPlanner({
      eventId: event.id,
      assignedServiceCenterId: event.assignedServiceCenter?.id ?? "",
      assignedTechnicianId: event.assignedTechnician?.id ?? "",
      scheduledFor: toDateTimeLocalValue(event.scheduledFor),
      cancellationReason: "",
    });
    setError(null);
  };

  const saveEventPlan = async (status?: "cancelled") => {
    if (!eventPlanner) {
      return;
    }

    setError(null);
    setIsSavingEvent(true);

    try {
      const response = await fetch(
        `/api/manufacturer/preventive-maintenance/events/${eventPlanner.eventId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            status === "cancelled"
              ? {
                  status,
                  cancellationReason: eventPlanner.cancellationReason,
                }
              : {
                  assignedServiceCenterId:
                    eventPlanner.assignedServiceCenterId || null,
                  assignedTechnicianId:
                    eventPlanner.assignedTechnicianId || null,
                  scheduledFor: eventPlanner.scheduledFor || null,
                },
          ),
        },
      );
      const body = (await response.json()) as {
        event?: PreventiveMaintenanceEventView;
        error?: string;
      };

      if (!response.ok || !body.event) {
        throw new Error(body.error ?? "Unable to update PM event.");
      }

      setEvents((current) =>
        current.map((event) => (event.id === body.event!.id ? body.event! : event)),
      );
      setEventPlanner(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update PM event.",
      );
    } finally {
      setIsSavingEvent(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Preventive Maintenance"
        description="Create product-model schedules, regenerate events, and dispatch upcoming PM visits."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => void regenerateEvents()}
              disabled={isRegenerating || plans.length === 0}
            >
              {isRegenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Regenerate Events
            </Button>
            <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={productModels.length === 0}>
                  <Plus className="size-4" />
                  New Plan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create PM Plan</DialogTitle>
                  <DialogDescription>
                    Attach recurring maintenance rules to one product model.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium">
                      Product model
                      <select
                        value={planForm.productModelId}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                        onChange={(event) =>
                          setPlanForm((current) => ({
                            ...current,
                            productModelId: event.target.value,
                          }))
                        }
                      >
                        {productModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                            {model.modelNumber ? ` (${model.modelNumber})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Plan name
                      <Input
                        value={planForm.name}
                        onChange={(event) =>
                          setPlanForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="6 month service"
                      />
                    </label>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="space-y-2 text-sm font-medium">
                      Event type
                      <select
                        value={planForm.eventType}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                        onChange={(event) =>
                          setPlanForm((current) => ({
                            ...current,
                            eventType: event.target
                              .value as PlanFormState["eventType"],
                          }))
                        }
                      >
                        <option value="preventive_maintenance">
                          Preventive maintenance
                        </option>
                        <option value="calibration">Calibration</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Cadence
                      <select
                        value={planForm.cadenceType}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                        onChange={(event) =>
                          setPlanForm((current) => ({
                            ...current,
                            cadenceType: event.target
                              .value as PreventiveMaintenanceCadenceType,
                          }))
                        }
                      >
                        <option value="interval_days">Interval days</option>
                        <option value="month_offsets">Month offsets</option>
                        <option value="manual">Manual only</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Due soon days
                      <Input
                        type="number"
                        min="1"
                        value={planForm.dueSoonThresholdDays}
                        onChange={(event) =>
                          setPlanForm((current) => ({
                            ...current,
                            dueSoonThresholdDays: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  {planForm.cadenceType === "interval_days" ? (
                    <label className="space-y-2 text-sm font-medium">
                      Interval days
                      <Input
                        type="number"
                        min="1"
                        value={planForm.intervalDays}
                        onChange={(event) =>
                          setPlanForm((current) => ({
                            ...current,
                            intervalDays: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {planForm.cadenceType === "month_offsets" ? (
                    <label className="space-y-2 text-sm font-medium">
                      Month offsets
                      <Input
                        value={planForm.monthOffsets}
                        onChange={(event) =>
                          setPlanForm((current) => ({
                            ...current,
                            monthOffsets: event.target.value,
                          }))
                        }
                        placeholder="6, 12, 18"
                      />
                    </label>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={planForm.customerAcknowledgementRequired}
                      onChange={(event) =>
                        setPlanForm((current) => ({
                          ...current,
                          customerAcknowledgementRequired:
                            event.target.checked,
                        }))
                      }
                    />
                    Customer acknowledgement required
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    Checklist template
                    <Textarea
                      value={planForm.checklistTemplate}
                      className="min-h-28"
                      onChange={(event) =>
                        setPlanForm((current) => ({
                          ...current,
                          checklistTemplate: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    Calibration template
                    <Textarea
                      value={planForm.calibrationTemplate}
                      className="min-h-20"
                      onChange={(event) =>
                        setPlanForm((current) => ({
                          ...current,
                          calibrationTemplate: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                {error ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setPlanDialogOpen(false)}
                    disabled={isSavingPlan}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void createPlan()}
                    disabled={isSavingPlan || !planForm.productModelId}
                  >
                    {isSavingPlan ? "Creating..." : "Create Plan"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {error && !planDialogOpen && !eventPlanner ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Active Plans"
          value={activePlanCount.toLocaleString()}
          description="Product model maintenance rules"
          icon={SlidersHorizontal}
        />
        <MetricCard
          title="Due Queue"
          value={dueCount.toLocaleString()}
          description="Due, due soon, or overdue visits"
          icon={CalendarClock}
        />
        <MetricCard
          title="Scheduled"
          value={scheduledCount.toLocaleString()}
          description="Assigned to service execution"
          icon={RefreshCw}
        />
        <MetricCard
          title="Completed"
          value={completedCount.toLocaleString()}
          description="Finished PM events in this view"
          icon={XCircle}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.5fr]">
        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
            <CardDescription>
              Recurring rules used during install completion and regeneration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No preventive maintenance plans created yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {plan.productModel.name}
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              plan.status === "active"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                            }
                          >
                            {plan.statusLabel}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <p>{plan.eventTypeLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {plan.cadenceTypeLabel}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {plan.eventCount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Queue</CardTitle>
            <CardDescription>
              Assign service centers, schedule technicians, or cancel PM events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No generated PM events yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{event.eventNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.asset.productModel.name} /{" "}
                            {event.asset.publicCode}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.asset.customer?.name ?? "Customer unavailable"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <p>{formatDate(event.dueDate)}</p>
                          <p className="text-xs text-muted-foreground">
                            Scheduled {formatDateTime(event.scheduledFor)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <p>
                            {event.assignedServiceCenter?.name ??
                              "No service center"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.assignedTechnician?.name ?? "No technician"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusClass(event.displayStatus)}
                        >
                          {event.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEventPlanner(event)}
                          disabled={
                            event.status === "completed" ||
                            event.status === "cancelled"
                          }
                        >
                          Plan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(eventPlanner)}
        onOpenChange={(open) => !open && setEventPlanner(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan PM Event</DialogTitle>
            <DialogDescription>
              {plannerEvent
                ? `${plannerEvent.eventNumber} for ${plannerEvent.asset.productModel.name}`
                : "Update assignment and schedule."}
            </DialogDescription>
          </DialogHeader>
          {eventPlanner ? (
            <div className="space-y-4 py-2">
              <label className="space-y-2 text-sm font-medium">
                Service center
                <select
                  value={eventPlanner.assignedServiceCenterId}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  onChange={(event) =>
                    setEventPlanner((current) =>
                      current
                        ? {
                            ...current,
                            assignedServiceCenterId: event.target.value,
                            assignedTechnicianId: "",
                          }
                        : current,
                    )
                  }
                >
                  <option value="">Unassigned</option>
                  {serviceCenters.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name}
                      {center.city ? ` (${center.city})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium">
                Technician
                <select
                  value={eventPlanner.assignedTechnicianId}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  onChange={(event) =>
                    setEventPlanner((current) =>
                      current
                        ? {
                            ...current,
                            assignedTechnicianId: event.target.value,
                          }
                        : current,
                    )
                  }
                >
                  <option value="">Unassigned</option>
                  {availableTechnicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.name} / {technician.serviceCenterName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium">
                Scheduled for
                <Input
                  type="datetime-local"
                  value={eventPlanner.scheduledFor}
                  onChange={(event) =>
                    setEventPlanner((current) =>
                      current
                        ? { ...current, scheduledFor: event.target.value }
                        : current,
                    )
                  }
                />
              </label>

              <label className="space-y-2 text-sm font-medium">
                Cancellation reason
                <Textarea
                  value={eventPlanner.cancellationReason}
                  onChange={(event) =>
                    setEventPlanner((current) =>
                      current
                        ? {
                            ...current,
                            cancellationReason: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder="Required only when cancelling"
                />
              </label>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEventPlanner(null)}
              disabled={isSavingEvent}
            >
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => void saveEventPlan("cancelled")}
              disabled={isSavingEvent}
            >
              Cancel Event
            </Button>
            <Button
              onClick={() => void saveEventPlan()}
              disabled={isSavingEvent}
            >
              {isSavingEvent ? "Saving..." : "Save Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

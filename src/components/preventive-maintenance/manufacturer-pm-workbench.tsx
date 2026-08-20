"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  UserRoundCheck,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PmEventTimeline } from "@/components/preventive-maintenance/pm-event-timeline";
import { formatPreventiveMaintenanceFrequency } from "@/lib/preventive-maintenance";
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

type WorkbenchView = "schedules" | "calendar" | "visits";

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

function formatMonthLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
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

function getVisitDate(event: PreventiveMaintenanceEventView) {
  const date = new Date(event.scheduledFor ?? event.dueDate);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getCalendarStart(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  return addDays(firstDay, -mondayOffset);
}

function getInitialCalendarDate(events: PreventiveMaintenanceEventView[]) {
  const firstOpenVisit = [...events]
    .filter(
      (event) => event.status !== "completed" && event.status !== "cancelled",
    )
    .sort((left, right) => {
      const leftDate = getVisitDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDate =
        getVisitDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    })[0];

  const anchorVisit = firstOpenVisit ?? events[0];
  return startOfLocalDay(
    anchorVisit ? (getVisitDate(anchorVisit) ?? new Date()) : new Date(),
  );
}

function getVisitTimingLabel(event: PreventiveMaintenanceEventView) {
  if (event.scheduledFor) {
    return `Scheduled ${formatDateTime(event.scheduledFor)}`;
  }

  return `Due ${formatDate(event.dueDate)}`;
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

function formatPlanFrequency(plan: PreventiveMaintenancePlanView) {
  return formatPreventiveMaintenanceFrequency(
    plan.cadenceType,
    plan.cadenceConfig,
  );
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

function buildCalendarDays(
  anchorMonth: Date,
  visits: PreventiveMaintenanceEventView[],
) {
  const monthStart = new Date(
    anchorMonth.getFullYear(),
    anchorMonth.getMonth(),
    1,
  );
  const calendarStart = getCalendarStart(monthStart);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(calendarStart, index);
    const dayVisits = visits.filter((event) => {
      const visitDate = getVisitDate(event);
      return visitDate ? isSameLocalDay(date, visitDate) : false;
    });

    return {
      key: date.toISOString(),
      date,
      isCurrentMonth: date.getMonth() === anchorMonth.getMonth(),
      visits: dayVisits,
    };
  });
}

function VisitDetailPanel({
  visit,
  onSchedule,
}: {
  visit: PreventiveMaintenanceEventView | null;
  onSchedule: (visit: PreventiveMaintenanceEventView) => void;
}) {
  if (!visit) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Visit Details</CardTitle>
          <CardDescription>
            Select a calendar visit to review customer, site, and assignment
            details.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const customerName = visit.asset.customer?.name ?? "Customer unavailable";
  const technicianName =
    visit.assignedTechnician?.name ?? "Technician not assigned";
  const serviceCenterName =
    visit.assignedServiceCenter?.name ?? "Service center not assigned";

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{visit.asset.productModel.name}</CardTitle>
            <CardDescription>
              {visit.asset.publicCode} - {customerName}
            </CardDescription>
          </div>
          <Badge variant="outline" className={statusClass(visit.displayStatus)}>
            {visit.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Visit Timing
            </p>
            <p className="mt-1">{getVisitTimingLabel(visit)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Service Type
            </p>
            <p className="mt-1">{visit.eventTypeLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Service Center
            </p>
            <p className="mt-1">{serviceCenterName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Technician
            </p>
            <p className="mt-1">{technicianName}</p>
          </div>
        </div>

        <div className="rounded-md border bg-slate-50 p-3 text-sm">
          <p className="font-medium">Customer view</p>
          <p className="mt-1 text-muted-foreground">
            {customerName} can see the upcoming service date, assigned service
            team, and current visit status for this installed asset.
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => onSchedule(visit)}
          disabled={
            visit.status === "completed" || visit.status === "cancelled"
          }
        >
          <UserRoundCheck className="size-4" />
          Assign or Reschedule
        </Button>
      </CardContent>
    </Card>
  );
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
  const [activeView, setActiveView] = useState<WorkbenchView>("calendar");
  const [calendarMonth, setCalendarMonth] = useState(() =>
    getInitialCalendarDate(initialEvents),
  );
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(
    initialEvents[0]?.id ?? null,
  );

  const activePlanCount = plans.filter(
    (plan) => plan.status === "active",
  ).length;
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

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth, sortedEvents),
    [calendarMonth, sortedEvents],
  );

  const visibleMonthVisits = useMemo(
    () =>
      sortedEvents.filter((event) => {
        const visitDate = getVisitDate(event);

        return (
          visitDate &&
          visitDate.getFullYear() === calendarMonth.getFullYear() &&
          visitDate.getMonth() === calendarMonth.getMonth()
        );
      }),
    [calendarMonth, sortedEvents],
  );

  const selectedVisit =
    events.find((event) => event.id === selectedVisitId) ??
    visibleMonthVisits[0] ??
    sortedEvents[0] ??
    null;

  const technicianWorkload = useMemo(() => {
    const workload = new Map<
      string,
      { technicianName: string; serviceCenterName: string; visitCount: number }
    >();

    for (const visit of visibleMonthVisits) {
      const key = visit.assignedTechnician?.id ?? "unassigned";
      const current = workload.get(key) ?? {
        technicianName: visit.assignedTechnician?.name ?? "Technician not assigned",
        serviceCenterName:
          visit.assignedServiceCenter?.name ?? "Service center not assigned",
        visitCount: 0,
      };

      workload.set(key, {
        ...current,
        visitCount: current.visitCount + 1,
      });
    }

    return [...workload.values()].sort(
      (left, right) => right.visitCount - left.visitCount,
    );
  }, [visibleMonthVisits]);

  const plannerEvent = eventPlanner
    ? (events.find((event) => event.id === eventPlanner.eventId) ?? null)
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
      throw new Error(body.error ?? "Unable to refresh maintenance visits.");
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
        throw new Error(body.error ?? "Unable to create maintenance schedule.");
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
          : "Unable to create maintenance schedule.",
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
        throw new Error(body.error ?? "Unable to refresh maintenance visits.");
      }

      await refreshEvents();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to refresh maintenance visits.",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const openEventPlanner = (event: PreventiveMaintenanceEventView) => {
    setSelectedVisitId(event.id);
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
        throw new Error(body.error ?? "Unable to update maintenance visit.");
      }

      setEvents((current) =>
        current.map((event) =>
          event.id === body.event!.id ? body.event! : event,
        ),
      );
      setEventPlanner(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update maintenance visit.",
      );
    } finally {
      setIsSavingEvent(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <PageHeader
        title="Maintenance Schedules"
        description="Attach service frequency to product models and track the visits created for installed assets."
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
              Refresh Visits
            </Button>
            <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={productModels.length === 0}>
                  <Plus className="size-4" />
                  New Schedule
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Product Schedule</DialogTitle>
                  <DialogDescription>
                    Choose the product model and how often installed assets
                    should be serviced.
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
                      Schedule name
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
                      Service type
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
                      Frequency type
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
                        <option value="interval_days">Every N days</option>
                        <option value="month_offsets">
                          Specific months after installation
                        </option>
                        <option value="manual">Manual scheduling</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Show as due soon (days before)
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
                      Repeat every (days)
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
                      Service months after installation
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
                          customerAcknowledgementRequired: event.target.checked,
                        }))
                      }
                    />
                    Customer sign-off required
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    Service checklist
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
                    Calibration checklist
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
                    {isSavingPlan ? "Creating..." : "Create Schedule"}
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

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Product Schedules"
          value={activePlanCount.toLocaleString()}
          description="Product models with service frequency"
          icon={SlidersHorizontal}
        />
        <MetricCard
          title="Due Visits"
          value={dueCount.toLocaleString()}
          description="Due, due soon, or overdue"
          icon={CalendarClock}
        />
        <MetricCard
          title="Scheduled"
          value={scheduledCount.toLocaleString()}
          description="Assigned to service teams"
          icon={RefreshCw}
        />
        <MetricCard
          title="Completed"
          value={completedCount.toLocaleString()}
          description="Finished maintenance visits"
          icon={XCircle}
        />
      </div>

      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as WorkbenchView)}
        className="mt-4 min-w-0"
      >
        <TabsList className="w-full justify-start overflow-x-auto bg-white p-1">
          <TabsTrigger value="calendar" className="px-4">
            <CalendarDays className="size-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="schedules" className="px-4">
            <SlidersHorizontal className="size-4" />
            Product Schedules
          </TabsTrigger>
          <TabsTrigger value="visits" className="px-4">
            <ClipboardList className="size-4" />
            Visit List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Maintenance Calendar</CardTitle>
                    <CardDescription>
                      Upcoming and scheduled visits for installed assets.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Previous month"
                      onClick={() =>
                        setCalendarMonth((current) => addMonths(current, -1))
                      }
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <p className="min-w-36 text-center text-sm font-semibold">
                      {formatMonthLabel(calendarMonth)}
                    </p>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Next month"
                      onClick={() =>
                        setCalendarMonth((current) => addMonths(current, 1))
                      }
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (day) => (
                      <div key={day} className="px-2">
                        {day}
                      </div>
                    ),
                  )}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {calendarDays.map((day) => (
                    <div
                      key={day.key}
                      className={`min-h-32 rounded-md border bg-white p-2 ${
                        day.isCurrentMonth ? "" : "bg-slate-50 text-slate-400"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {day.date.getDate()}
                        </span>
                        {day.visits.length > 0 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            {day.visits.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 space-y-1">
                        {day.visits.slice(0, 3).map((visit) => (
                          <button
                            key={visit.id}
                            type="button"
                            onClick={() => setSelectedVisitId(visit.id)}
                            className={`w-full rounded border px-2 py-1 text-left text-[11px] leading-tight transition hover:bg-slate-50 ${
                              selectedVisit?.id === visit.id
                                ? "border-indigo-300 bg-indigo-50"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <span className="block truncate font-medium">
                              {visit.asset.productModel.name}
                            </span>
                            <span className="block truncate text-muted-foreground">
                              {visit.assignedTechnician?.name ??
                                "Technician not assigned"}
                            </span>
                          </button>
                        ))}
                        {day.visits.length > 3 ? (
                          <p className="text-[11px] text-muted-foreground">
                            +{day.visits.length - 3} more visits
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <VisitDetailPanel
                visit={selectedVisit}
                onSchedule={openEventPlanner}
              />
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Technician Allocation</CardTitle>
                  <CardDescription>
                    Work assigned in {formatMonthLabel(calendarMonth)}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {technicianWorkload.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No visits are planned for this month.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {technicianWorkload.map((row) => (
                        <div
                          key={`${row.technicianName}-${row.serviceCenterName}`}
                          className="flex items-center justify-between gap-3 rounded-md border p-3"
                        >
                          <div>
                            <p className="font-medium">{row.technicianName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.serviceCenterName}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50"
                          >
                            {row.visitCount} visits
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schedules" className="mt-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Product Maintenance Schedules</CardTitle>
              <CardDescription>
                Each schedule is attached to a product model. Installed assets
                follow it automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-full overflow-x-auto">
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Schedule</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-muted-foreground"
                        >
                          No maintenance schedules created yet.
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
                              <p>{formatPlanFrequency(plan)}</p>
                              <p className="text-xs text-muted-foreground">
                                {plan.eventTypeLabel}
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Scheduled Maintenance Visits</CardTitle>
              <CardDescription>
                Review upcoming visits and assign service teams.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-full overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Visit</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEvents.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-muted-foreground"
                        >
                          No maintenance visits generated yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">
                                {event.eventNumber}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {event.asset.productModel.name} /{" "}
                                {event.asset.publicCode}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {event.asset.customer?.name ??
                                  "Customer unavailable"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <p>{formatDate(event.dueDate)}</p>
                              <p className="text-xs text-muted-foreground">
                                {getVisitTimingLabel(event)}
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
                                {event.assignedTechnician?.name ??
                                  "No technician"}
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
                              Schedule Visit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(eventPlanner)}
        onOpenChange={(open) => !open && setEventPlanner(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Maintenance Visit</DialogTitle>
            <DialogDescription>
              {plannerEvent
                ? `${plannerEvent.eventNumber} for ${plannerEvent.asset.productModel.name}`
                : "Update service assignment and visit timing."}
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
                Visit date and time
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

              {plannerEvent ? (
                <PmEventTimeline entries={plannerEvent.timeline} />
              ) : null}
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
              Cancel Visit
            </Button>
            <Button
              onClick={() => void saveEventPlan()}
              disabled={isSavingEvent}
            >
              {isSavingEvent ? "Saving..." : "Save Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

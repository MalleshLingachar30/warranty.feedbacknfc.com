"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, UserCheck, Wrench } from "lucide-react";

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
  PreventiveMaintenanceEventStatus,
  PreventiveMaintenanceEventView,
  PreventiveMaintenanceTechnicianOption,
} from "@/components/preventive-maintenance/types";

type ServiceCenterPmQueueProps = {
  initialEvents: PreventiveMaintenanceEventView[];
  technicians: PreventiveMaintenanceTechnicianOption[];
};

type PlannerState = {
  eventId: string;
  assignedTechnicianId: string;
  scheduledFor: string;
  cancellationReason: string;
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

function eventRank(event: PreventiveMaintenanceEventView) {
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

export function ServiceCenterPmQueue({
  initialEvents,
  technicians,
}: ServiceCenterPmQueueProps) {
  const [events, setEvents] = useState(initialEvents);
  const [planner, setPlanner] = useState<PlannerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const openEvents = events.filter((event) =>
    ["due", "scheduled", "in_progress"].includes(event.status),
  ).length;
  const unassignedEvents = events.filter(
    (event) => !event.assignedTechnician && event.status !== "cancelled",
  ).length;
  const inProgressEvents = events.filter(
    (event) => event.status === "in_progress",
  ).length;
  const completedEvents = events.filter(
    (event) => event.status === "completed",
  ).length;

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const rankDelta = eventRank(left) - eventRank(right);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        return (
          new Date(left.scheduledFor ?? left.dueDate).getTime() -
          new Date(right.scheduledFor ?? right.dueDate).getTime()
        );
      }),
    [events],
  );

  const selectedEvent = planner
    ? events.find((event) => event.id === planner.eventId) ?? null
    : null;

  const refreshEvents = async () => {
    setError(null);
    setIsRefreshing(true);

    try {
      const response = await fetch(
        "/api/service-center/preventive-maintenance/events?limit=200",
        { method: "GET" },
      );
      const body = (await response.json()) as {
        events?: PreventiveMaintenanceEventView[];
        error?: string;
      };

      if (!response.ok || !body.events) {
        throw new Error(body.error ?? "Unable to refresh PM queue.");
      }

      setEvents(body.events);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to refresh PM queue.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const openPlanner = (event: PreventiveMaintenanceEventView) => {
    setPlanner({
      eventId: event.id,
      assignedTechnicianId: event.assignedTechnician?.id ?? "",
      scheduledFor: toDateTimeLocalValue(event.scheduledFor),
      cancellationReason: "",
    });
    setError(null);
  };

  const saveEvent = async (status?: "cancelled") => {
    if (!planner) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/service-center/preventive-maintenance/events/${planner.eventId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            status === "cancelled"
              ? {
                  status,
                  cancellationReason: planner.cancellationReason,
                }
              : {
                  assignedTechnicianId: planner.assignedTechnicianId || null,
                  scheduledFor: planner.scheduledFor || null,
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
      setPlanner(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update PM event.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Preventive Maintenance"
        description="Schedule assigned PM visits and route them to technicians."
        actions={
          <Button
            variant="outline"
            onClick={() => void refreshEvents()}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        }
      />

      {error && !planner ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Open PM"
          value={openEvents.toLocaleString()}
          description="Due, scheduled, or in progress"
          icon={CalendarClock}
        />
        <MetricCard
          title="Needs Tech"
          value={unassignedEvents.toLocaleString()}
          description="Waiting for technician assignment"
          icon={UserCheck}
        />
        <MetricCard
          title="In Progress"
          value={inProgressEvents.toLocaleString()}
          description="Technician is on site"
          icon={Wrench}
        />
        <MetricCard
          title="Completed"
          value={completedEvents.toLocaleString()}
          description="Finished PM events in this queue"
          icon={RefreshCw}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>PM Queue</CardTitle>
          <CardDescription>
            Events assigned to service centers in this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visit</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No preventive maintenance events assigned here yet.
                  </TableCell>
                </TableRow>
              ) : (
                sortedEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{event.eventNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.asset.productModel.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.asset.publicCode}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>{event.asset.customer?.name ?? "Customer unavailable"}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.asset.customer?.phone ??
                            event.asset.customer?.email ??
                            "No contact"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>Due {formatDate(event.dueDate)}</p>
                        <p className="text-xs text-muted-foreground">
                          Scheduled {formatDateTime(event.scheduledFor)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>{event.assignedTechnician?.name ?? "Unassigned"}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.assignedServiceCenter?.name ?? "No center"}
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
                        onClick={() => openPlanner(event)}
                        disabled={
                          event.status === "completed" ||
                          event.status === "cancelled" ||
                          event.status === "in_progress"
                        }
                      >
                        Schedule
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(planner)} onOpenChange={(open) => !open && setPlanner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule PM Visit</DialogTitle>
            <DialogDescription>
              {selectedEvent
                ? `${selectedEvent.eventNumber} for ${selectedEvent.asset.productModel.name}`
                : "Assign a technician and visit time."}
            </DialogDescription>
          </DialogHeader>

          {planner ? (
            <div className="space-y-4 py-2">
              <label className="space-y-2 text-sm font-medium">
                Technician
                <select
                  value={planner.assignedTechnicianId}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  onChange={(event) =>
                    setPlanner((current) =>
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
                  {technicians.map((technician) => (
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
                  value={planner.scheduledFor}
                  onChange={(event) =>
                    setPlanner((current) =>
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
                  value={planner.cancellationReason}
                  onChange={(event) =>
                    setPlanner((current) =>
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

              {selectedEvent?.timeline.length ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Recent timeline
                  </p>
                  <div className="space-y-2">
                    {selectedEvent.timeline.map((entry) => (
                      <div key={entry.id} className="text-xs text-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">
                            {entry.eventTypeLabel}
                          </span>
                          <span className="shrink-0 text-slate-500">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-slate-600">
                          {entry.eventDescription ?? "PM event updated."}
                        </p>
                        {entry.actorName || entry.actorRole ? (
                          <p className="mt-0.5 text-slate-500">
                            {entry.actorName ?? "System"}
                            {entry.actorRole ? ` / ${entry.actorRole}` : ""}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
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
              onClick={() => setPlanner(null)}
              disabled={isSaving}
            >
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => void saveEvent("cancelled")}
              disabled={isSaving}
            >
              Cancel Event
            </Button>
            <Button onClick={() => void saveEvent()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

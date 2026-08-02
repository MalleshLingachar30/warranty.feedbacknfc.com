"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  ClipboardList,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PmDeliveryAttemptSummary,
  type PmDeliveryAttempt,
} from "@/components/notifications/pm-delivery-attempt-summary";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/roles";

type PmNotificationTrigger =
  | "scheduled"
  | "reassigned"
  | "started"
  | "completed"
  | "cancelled";

type PmNotificationStatus =
  | "pending"
  | "delivered"
  | "dismissed"
  | "cancelled";

type StatusFilter = PmNotificationStatus | "all";
type TriggerFilter = PmNotificationTrigger | "all";

type PmNotification = {
  id: string;
  triggerType: PmNotificationTrigger;
  recipientRole: "manufacturer" | "service_center" | "technician" | "customer";
  status: PmNotificationStatus;
  title: string;
  message: string;
  createdAt: string;
  deliveryAttempts: PmDeliveryAttempt[];
  event: {
    eventNumber: string;
    eventType: "preventive_maintenance" | "calibration";
    status: string;
    dueDate: string;
    scheduledFor: string | null;
    completedAt: string | null;
    asset: {
      publicCode: string | null;
      serialNumber: string | null;
      productModel: {
        name: string;
        modelNumber: string;
      };
    };
    assignedServiceCenter: {
      name: string;
      city: string | null;
    } | null;
    assignedTechnician: {
      name: string;
    } | null;
  };
};

type PmNotificationResponse = {
  notifications: PmNotification[];
  pendingCount: number;
  filteredCount: number;
  statusCounts: Record<PmNotificationStatus, number>;
};

interface PmNotificationCenterProps {
  role: AppRole;
}

const statusFilters = [
  { value: "pending", label: "Pending" },
  { value: "dismissed", label: "Dismissed" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: StatusFilter; label: string }[];

const triggerFilters = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "reassigned", label: "Reassigned" },
  { value: "started", label: "Started" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const satisfies readonly { value: TriggerFilter; label: string }[];

function pmWorkspaceHref(role: AppRole) {
  if (role === "manufacturer_admin" || role === "internal_label_admin") {
    return "/dashboard/manufacturer/preventive-maintenance";
  }

  if (role === "field_technician") {
    return "/dashboard/my-jobs";
  }

  if (role === "customer") {
    return "/dashboard/customer";
  }

  return "/dashboard/preventive-maintenance";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatAge(value: string) {
  const createdAt = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}

function labelFromSnakeCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function triggerTone(triggerType: PmNotificationTrigger) {
  switch (triggerType) {
    case "scheduled":
    case "reassigned":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "started":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function statusTone(status: PmNotificationStatus) {
  switch (status) {
    case "pending":
      return "border-slate-300 bg-white text-slate-700";
    case "delivered":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "dismissed":
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
    case "cancelled":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function assetLabel(notification: PmNotification) {
  const identifier =
    notification.event.asset.publicCode ?? notification.event.asset.serialNumber;
  const model = notification.event.asset.productModel.modelNumber
    ? `${notification.event.asset.productModel.name} (${notification.event.asset.productModel.modelNumber})`
    : notification.event.asset.productModel.name;

  return identifier ? `${model} | ${identifier}` : model;
}

function recipientLabel(notification: PmNotification) {
  switch (notification.recipientRole) {
    case "service_center":
      return notification.event.assignedServiceCenter?.name ?? "Service center";
    case "technician":
      return notification.event.assignedTechnician?.name ?? "Technician";
    case "manufacturer":
      return "Manufacturer";
    case "customer":
      return "Customer";
    default:
      return labelFromSnakeCase(notification.recipientRole);
  }
}

export function PmNotificationCenter({ role }: PmNotificationCenterProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all");
  const [notifications, setNotifications] = useState<PmNotification[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<
    Record<PmNotificationStatus, number>
  >({
    pending: 0,
    delivered: 0,
    dismissed: 0,
    cancelled: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBulkDismissing, setIsBulkDismissing] = useState(false);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const workspaceHref = useMemo(() => pmWorkspaceHref(role), [role]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      limit: "50",
      status: statusFilter,
    });

    if (triggerFilter !== "all") {
      params.set("triggerType", triggerFilter);
    }

    return params.toString();
  }, [statusFilter, triggerFilter]);

  const fetchNotifications = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(
          `/api/preventive-maintenance/notifications?${queryString}`,
          {
            method: "GET",
          },
        );
        const body = (await response.json()) as
          | PmNotificationResponse
          | { error?: string };

        if (!response.ok || !("notifications" in body)) {
          throw new Error(
            "error" in body
              ? (body.error ?? "Unable to load PM notifications.")
              : "Unable to load PM notifications.",
          );
        }

        setNotifications(body.notifications);
        setPendingCount(body.pendingCount);
        setFilteredCount(body.filteredCount);
        setStatusCounts(body.statusCounts);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load PM notifications.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [queryString],
  );

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const dismissNotification = useCallback(
    async (notificationId: string) => {
      setDismissingIds((current) => new Set(current).add(notificationId));
      setError(null);

      try {
        const response = await fetch(
          `/api/preventive-maintenance/notifications/${notificationId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "dismiss" }),
          },
        );
        const body = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to dismiss notification.");
        }

        await fetchNotifications({ silent: true });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to dismiss notification.",
        );
      } finally {
        setDismissingIds((current) => {
          const next = new Set(current);
          next.delete(notificationId);
          return next;
        });
      }
    },
    [fetchNotifications],
  );

  const dismissAllVisible = useCallback(async () => {
    setIsBulkDismissing(true);
    setError(null);

    try {
      const response = await fetch("/api/preventive-maintenance/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "dismiss_all",
          status: statusFilter,
          triggerType: triggerFilter === "all" ? undefined : triggerFilter,
        }),
      });
      const body = (await response.json()) as
        | { dismissedCount: number }
        | { error?: string };

      if (!response.ok || !("dismissedCount" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to dismiss notifications.")
            : "Unable to dismiss notifications.",
        );
      }

      await fetchNotifications({ silent: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to dismiss notifications.",
      );
    } finally {
      setIsBulkDismissing(false);
    }
  }, [fetchNotifications, statusFilter, triggerFilter]);

  const canDismissAll =
    !isLoading &&
    !isBulkDismissing &&
    filteredCount > 0 &&
    (statusFilter === "pending" || statusFilter === "all");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Bell className="h-3.5 w-3.5" />
            Pending
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {pendingCount}
          </p>
        </div>
        {(["delivered", "dismissed", "cancelled"] as const).map((status) => (
          <div
            key={status}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <ClipboardList className="h-3.5 w-3.5" />
              {labelFromSnakeCase(status)}
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {statusCounts[status]}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  variant={statusFilter === filter.value ? "default" : "outline"}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Event
            </p>
            <div className="flex flex-wrap gap-2">
              {triggerFilters.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  variant={triggerFilter === filter.value ? "default" : "outline"}
                  onClick={() => setTriggerFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 lg:self-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchNotifications({ silent: true })}
              disabled={isRefreshing || isLoading}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void dismissAllVisible()}
              disabled={!canDismissAll}
            >
              {isBulkDismissing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Dismiss all
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {isLoading ? (
          <Card className="border-slate-200">
            <CardContent className="flex items-center gap-2 p-5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading PM notification inbox
            </CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="px-4 py-12 text-center">
              <Inbox className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                No notifications match these filters
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                PM schedule, reassignment, start, completion, and cancellation
                updates will appear here as in-app notifications.
              </p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => {
            const scheduledLabel = formatDateTime(
              notification.event.scheduledFor ?? notification.event.dueDate,
            );
            const isDismissing = dismissingIds.has(notification.id);

            return (
              <Card key={notification.id} className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                          <CalendarClock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {notification.event.eventNumber} |{" "}
                            {recipientLabel(notification)} |{" "}
                            {formatAge(notification.createdAt)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 capitalize",
                            triggerTone(notification.triggerType),
                          )}
                        >
                          {labelFromSnakeCase(notification.triggerType)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 capitalize",
                            statusTone(notification.status),
                          )}
                        >
                          {labelFromSnakeCase(notification.status)}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        {notification.message}
                      </p>
                      <PmDeliveryAttemptSummary
                        attempts={notification.deliveryAttempts}
                      />
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                        <div>
                          <span className="font-medium text-slate-700">Asset:</span>{" "}
                          {assetLabel(notification)}
                        </div>
                        <div>
                          <span className="font-medium text-slate-700">Window:</span>{" "}
                          {scheduledLabel ?? "Not scheduled"}
                        </div>
                        <div>
                          <span className="font-medium text-slate-700">
                            PM status:
                          </span>{" "}
                          {labelFromSnakeCase(notification.event.status)}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-[150px] shrink-0 items-center gap-2 lg:justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={workspaceHref}>Open PM</Link>
                      </Button>
                      {notification.status === "pending" ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            void dismissNotification(notification.id)
                          }
                          disabled={isDismissing}
                          aria-label={`Dismiss ${notification.title}`}
                        >
                          {isDismissing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

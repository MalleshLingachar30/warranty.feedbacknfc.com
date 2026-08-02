"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  Check,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
};

interface PmNotificationInboxProps {
  role: AppRole;
}

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
  const diffMs = Date.now() - createdAt;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

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

function triggerLabel(triggerType: PmNotificationTrigger) {
  return triggerType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function assetLabel(notification: PmNotification) {
  const identifier =
    notification.event.asset.publicCode ?? notification.event.asset.serialNumber;
  const model = notification.event.asset.productModel.modelNumber
    ? `${notification.event.asset.productModel.name} (${notification.event.asset.productModel.modelNumber})`
    : notification.event.asset.productModel.name;

  return identifier ? `${model} | ${identifier}` : model;
}

export function PmNotificationInbox({ role }: PmNotificationInboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<PmNotification[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(() => new Set());
  const workspaceHref = useMemo(() => pmWorkspaceHref(role), [role]);

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
          "/api/preventive-maintenance/notifications?limit=12",
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
    [],
  );

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (isOpen) {
      void fetchNotifications({ silent: true });
    }
  }, [fetchNotifications, isOpen]);

  const dismissNotification = useCallback(async (notificationId: string) => {
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
          body: JSON.stringify({
            action: "dismiss",
          }),
        },
      );
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to dismiss notification.");
      }

      setNotifications((current) =>
        current.filter((notification) => notification.id !== notificationId),
      );
      setPendingCount((current) => Math.max(0, current - 1));
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
  }, []);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label="Open PM notifications"
        >
          <Bell className="h-4 w-4" />
          {pendingCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[calc(100vw-2rem)] p-0 sm:w-[420px]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-slate-900">
            PM Notifications
          </DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => void fetchNotifications({ silent: true })}
            disabled={isRefreshing || isLoading}
            aria-label="Refresh PM notifications"
          >
            {isRefreshing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading PM notifications
            </div>
          ) : error ? (
            <div className="px-4 py-5 text-sm text-rose-700">{error}</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Inbox className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800">
                No pending PM notifications
              </p>
              <p className="mt-1 text-xs text-slate-500">
                New schedule, start, completion, reassignment, and cancellation
                updates will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => {
                const scheduledLabel = formatDateTime(
                  notification.event.scheduledFor ??
                    notification.event.dueDate,
                );
                const isDismissing = dismissingIds.has(notification.id);

                return (
                  <div key={notification.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                            {notification.title}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 capitalize",
                              triggerTone(notification.triggerType),
                            )}
                          >
                            {triggerLabel(notification.triggerType)}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                          {notification.message}
                        </p>
                        <PmDeliveryAttemptSummary
                          attempts={notification.deliveryAttempts}
                          compact
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <span>{notification.event.eventNumber}</span>
                          <span>|</span>
                          <span>{assetLabel(notification)}</span>
                          {scheduledLabel ? (
                            <>
                              <span>|</span>
                              <span>{scheduledLabel}</span>
                            </>
                          ) : null}
                          <span>|</span>
                          <span>{formatAge(notification.createdAt)}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Button
                            asChild
                            size="xs"
                            variant="outline"
                            onClick={() => setIsOpen(false)}
                          >
                            <Link href={workspaceHref}>Open PM</Link>
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() =>
                              void dismissNotification(notification.id)
                            }
                            disabled={isDismissing}
                            aria-label={`Dismiss ${notification.title}`}
                          >
                            {isDismissing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-slate-500">
          <span>{pendingCount} pending</span>
          <Link
            href="/dashboard/notifications"
            className="font-medium text-indigo-600 hover:text-indigo-700"
            onClick={() => setIsOpen(false)}
          >
            View inbox
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

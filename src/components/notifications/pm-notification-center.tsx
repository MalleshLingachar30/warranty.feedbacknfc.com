"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  Clock3,
  ClipboardList,
  Inbox,
  Loader2,
  MailCheck,
  RefreshCw,
  ServerCog,
  Send,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PmDeliveryAttemptSummary,
  type PmDeliveryAttempt,
} from "@/components/notifications/pm-delivery-attempt-summary";
import {
  PmNotificationPreferencesPanel,
  type PmNotificationPreferencesView,
} from "@/components/notifications/pm-notification-preferences-panel";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/roles";

type PmNotificationTrigger =
  | "scheduled"
  | "reassigned"
  | "started"
  | "completed"
  | "cancelled";

type PmNotificationStatus = "pending" | "delivered" | "dismissed" | "cancelled";

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
  lastDryRun: PmNotificationLastDryRun | null;
  deliveryReadiness: PmNotificationDeliveryReadiness | null;
  schedulerStatus: PmNotificationSchedulerStatus | null;
};

type PmNotificationDeliveryReadiness = {
  provider: "resend";
  liveEmail: {
    status: "disabled" | "incomplete" | "ready";
    enabled: boolean;
    apiKeyConfigured: boolean;
    fromEmailConfigured: boolean;
    missingConfiguration: string[];
  };
  canary: {
    status: "disabled" | "incomplete" | "ready";
    enabled: boolean;
    recipientConfigured: boolean;
    recipientAddressMasked: string | null;
    missingConfiguration: string[];
  };
  sms: {
    status: "unsupported";
  };
  preferences: PmNotificationPreferencesView | null;
};

type PmNotificationLastDryRun = {
  preparedAt: string;
  attemptCount: number;
  statusCounts: Record<
    "queued" | "sending" | "sent" | "failed" | "dead_letter" | "skipped",
    number
  >;
  missingRecipientCount: number;
  preferenceSuppressedCount: number;
  dryRunSkipCount: number;
};

type PmNotificationSchedulerStatus = {
  configuration: {
    enabled: boolean;
    mode: "disabled" | "dry_run" | "live";
    dryRun: boolean;
    liveDeliveryRequested: boolean;
    blockingReasons: string[];
    authorizationConfigured: boolean;
    schedule: string;
    batchLimit: number;
    maxAttempts: number;
  };
  deadLetterCount: number;
  lastRun: {
    id: string;
    status: "running" | "succeeded" | "completed_with_failures" | "failed";
    dryRun: boolean;
    requestedLiveDelivery: boolean;
    startedAt: string;
    completedAt: string | null;
    scannedIntentCount: number;
    candidateAttemptCount: number;
    providerCallCount: number;
    retriedAttemptCount: number;
    deferredRetryCount: number;
    deadLetteredAttemptCount: number;
    preferenceSuppressedCount: number;
    errorMessage: string | null;
  } | null;
};

type PmNotificationDispatchResponse = {
  dryRun: boolean;
  preparedAt: string | null;
  scannedIntentCount: number;
  candidateAttemptCount: number;
  createdAttemptCount: number;
  existingAttemptCount: number;
  missingRecipientCount: number;
  queuedAttemptCount: number;
  skippedAttemptCount: number;
  preferenceSuppressedCount: number;
  suppressionReasonCounts: Record<string, number>;
};

type PmNotificationCanaryResponse = {
  ok: true;
  auditId: string;
  recipientAddressMasked: string;
  providerMessageId: string | null;
  sentAt: string;
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
    notification.event.asset.publicCode ??
    notification.event.asset.serialNumber;
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

function lastDryRunResultLabel(summary: PmNotificationLastDryRun) {
  const readyCount = summary.statusCounts.queued + summary.dryRunSkipCount;
  const issueCount =
    summary.missingRecipientCount +
    summary.preferenceSuppressedCount +
    summary.statusCounts.failed;

  if (summary.attemptCount === 0) {
    return "No attempts prepared";
  }

  if (issueCount > 0) {
    return `${readyCount} prepared, ${issueCount} need operator review`;
  }

  return `${readyCount} prepared with no recipient gaps`;
}

function canRunPmDeliveryDryRun(role: AppRole) {
  return (
    role === "platform_owner" ||
    role === "field_super_admin" ||
    role === "field_service_admin" ||
    role === "manufacturer_admin" ||
    role === "service_center_admin" ||
    role === "field_dispatcher"
  );
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
  const [lastDryRun, setLastDryRun] = useState<PmNotificationLastDryRun | null>(
    null,
  );
  const [deliveryReadiness, setDeliveryReadiness] =
    useState<PmNotificationDeliveryReadiness | null>(null);
  const [schedulerStatus, setSchedulerStatus] =
    useState<PmNotificationSchedulerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBulkDismissing, setIsBulkDismissing] = useState(false);
  const [isDispatchingDryRun, setIsDispatchingDryRun] = useState(false);
  const [isSendingCanary, setIsSendingCanary] = useState(false);
  const [canaryConfirmed, setCanaryConfirmed] = useState(false);
  const [canaryResult, setCanaryResult] =
    useState<PmNotificationCanaryResponse | null>(null);
  const [dispatchResult, setDispatchResult] =
    useState<PmNotificationDispatchResponse | null>(null);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const workspaceHref = useMemo(() => pmWorkspaceHref(role), [role]);
  const canDispatchDryRun = useMemo(() => canRunPmDeliveryDryRun(role), [role]);

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
        setLastDryRun(body.lastDryRun);
        setDeliveryReadiness(body.deliveryReadiness);
        setSchedulerStatus(body.schedulerStatus);
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
      const response = await fetch(
        "/api/preventive-maintenance/notifications",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "dismiss_all",
            status: statusFilter,
            triggerType: triggerFilter === "all" ? undefined : triggerFilter,
          }),
        },
      );
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

  const runDeliveryDryRun = useCallback(async () => {
    setIsDispatchingDryRun(true);
    setError(null);
    setDispatchResult(null);

    try {
      const response = await fetch(
        "/api/preventive-maintenance/notifications/dispatch",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dryRun: true,
            channels: ["email", "sms"],
            limit: 50,
            triggerType: triggerFilter === "all" ? undefined : triggerFilter,
          }),
        },
      );
      const body = (await response.json()) as
        | PmNotificationDispatchResponse
        | { error?: string };

      if (!response.ok || !("createdAttemptCount" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to run delivery dry run.")
            : "Unable to run delivery dry run.",
        );
      }

      setDispatchResult(body);
      await fetchNotifications({ silent: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to run delivery dry run.",
      );
    } finally {
      setIsDispatchingDryRun(false);
    }
  }, [fetchNotifications, triggerFilter]);

  const sendLiveCanary = useCallback(async () => {
    setIsSendingCanary(true);
    setError(null);
    setCanaryResult(null);

    try {
      const response = await fetch(
        "/api/preventive-maintenance/notifications/canary",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmLiveCanary: canaryConfirmed,
          }),
        },
      );
      const body = (await response.json()) as
        | PmNotificationCanaryResponse
        | { error?: string };

      if (!response.ok || !("ok" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to send the live email canary.")
            : "Unable to send the live email canary.",
        );
      }

      setCanaryResult(body);
      setCanaryConfirmed(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send the live email canary.",
      );
    } finally {
      setIsSendingCanary(false);
    }
  }, [canaryConfirmed]);

  const canDismissAll =
    !isLoading &&
    !isBulkDismissing &&
    filteredCount > 0 &&
    (statusFilter === "pending" || statusFilter === "all");
  const preferencesBlockCanary =
    deliveryReadiness?.preferences?.emailEnabledRoleCount === 0;

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
                  variant={
                    statusFilter === filter.value ? "default" : "outline"
                  }
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
                  variant={
                    triggerFilter === filter.value ? "default" : "outline"
                  }
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

      {canDispatchDryRun && deliveryReadiness ? (
        <div
          className={cn(
            "rounded-lg border p-3",
            deliveryReadiness.liveEmail.status === "ready"
              ? "border-rose-300 bg-rose-50"
              : deliveryReadiness.liveEmail.status === "incomplete"
                ? "border-amber-300 bg-amber-50"
                : "border-emerald-200 bg-emerald-50/60",
          )}
        >
          <div className="flex items-start gap-3">
            {deliveryReadiness.liveEmail.status === "disabled" ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            ) : (
              <AlertTriangle
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  deliveryReadiness.liveEmail.status === "ready"
                    ? "text-rose-700"
                    : "text-amber-700",
                )}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Live delivery readiness
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "uppercase",
                    deliveryReadiness.liveEmail.status === "ready"
                      ? "border-rose-300 bg-rose-100 text-rose-800"
                      : deliveryReadiness.liveEmail.status === "incomplete"
                        ? "border-amber-300 bg-amber-100 text-amber-800"
                        : "border-emerald-300 bg-emerald-100 text-emerald-800",
                  )}
                >
                  {deliveryReadiness.liveEmail.status === "ready"
                    ? "Live email enabled"
                    : deliveryReadiness.liveEmail.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {deliveryReadiness.liveEmail.status === "ready"
                  ? "Warning: confirmed live email dispatches can call Resend. Normal notification sends are not initiated from this panel."
                  : deliveryReadiness.liveEmail.status === "incomplete"
                    ? `Live email is enabled but blocked by incomplete configuration: ${deliveryReadiness.liveEmail.missingConfiguration.join(", ")}.`
                    : "The PM_NOTIFICATION_EMAIL_DELIVERY_ENABLED hard gate is off. Live PM email dispatch is blocked by default."}
              </p>

              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Email via Resend
                    </span>
                    <span className="text-[11px] font-medium uppercase text-slate-500">
                      {deliveryReadiness.liveEmail.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    API key:{" "}
                    {deliveryReadiness.liveEmail.apiKeyConfigured
                      ? "configured"
                      : "missing"}
                    {" | "}
                    Sender:{" "}
                    {deliveryReadiness.liveEmail.fromEmailConfigured
                      ? "configured"
                      : "missing"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Internal email canary
                    </span>
                    <span className="text-[11px] font-medium uppercase text-slate-500">
                      {deliveryReadiness.canary.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Fixed recipient:{" "}
                    {deliveryReadiness.canary.recipientAddressMasked ??
                      "not configured"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      SMS delivery
                    </span>
                    <span className="text-[11px] font-medium uppercase text-slate-500">
                      Unsupported
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Live PM SMS sends remain blocked in this dispatcher.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 rounded-md border border-slate-200 bg-white/90 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <label
                    htmlFor="confirm-pm-email-canary"
                    className="flex items-start gap-2 text-xs font-medium text-slate-800"
                  >
                    <input
                      id="confirm-pm-email-canary"
                      type="checkbox"
                      checked={canaryConfirmed}
                      onChange={(event) =>
                        setCanaryConfirmed(event.currentTarget.checked)
                      }
                      disabled={
                        deliveryReadiness.canary.status !== "ready" ||
                        preferencesBlockCanary ||
                        isSendingCanary
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-rose-700"
                    />
                    <span>
                      I confirm this sends one real email only to{" "}
                      {deliveryReadiness.canary.recipientAddressMasked ??
                        "the configured internal mailbox"}
                      .
                    </span>
                  </label>
                  {deliveryReadiness.canary.status === "incomplete" ? (
                    <p className="mt-1 pl-6 text-[11px] text-amber-800">
                      Canary blocked by:{" "}
                      {deliveryReadiness.canary.missingConfiguration.join(", ")}
                      .
                    </p>
                  ) : deliveryReadiness.canary.status === "disabled" ? (
                    <p className="mt-1 pl-6 text-[11px] text-slate-500">
                      Canary sending requires
                      PM_NOTIFICATION_EMAIL_CANARY_ENABLED=true.
                    </p>
                  ) : preferencesBlockCanary ? (
                    <p className="mt-1 pl-6 text-[11px] text-amber-800">
                      Canary suppressed because email is disabled for every PM
                      audience in this organization.
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => void sendLiveCanary()}
                  disabled={
                    deliveryReadiness.canary.status !== "ready" ||
                    preferencesBlockCanary ||
                    !canaryConfirmed ||
                    isSendingCanary
                  }
                >
                  {isSendingCanary ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MailCheck className="h-4 w-4" />
                  )}
                  Send live canary
                </Button>
              </div>
              {canaryResult ? (
                <p className="mt-2 text-xs text-emerald-800">
                  Canary sent to {canaryResult.recipientAddressMasked} at{" "}
                  {formatDateTime(canaryResult.sentAt)}. Audit ID:{" "}
                  {canaryResult.auditId}.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {canDispatchDryRun && schedulerStatus ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <ServerCog className="h-3.5 w-3.5" />
                  Scheduled dispatcher
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "uppercase",
                    schedulerStatus.configuration.mode === "live"
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : schedulerStatus.configuration.mode === "dry_run"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-600",
                  )}
                >
                  {labelFromSnakeCase(schedulerStatus.configuration.mode)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    schedulerStatus.configuration.authorizationConfigured
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700",
                  )}
                >
                  Cron auth{" "}
                  {schedulerStatus.configuration.authorizationConfigured
                    ? "configured"
                    : "missing"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {schedulerStatus.configuration.enabled
                  ? `${schedulerStatus.configuration.schedule}; up to ${schedulerStatus.configuration.batchLimit} pending intents per run with ${schedulerStatus.configuration.maxAttempts} total email attempts.`
                  : "Automation is disabled. Cron requests cannot prepare attempts or call the email provider until PM_NOTIFICATION_SCHEDULED_DISPATCH_ENABLED=true."}
              </p>
              {schedulerStatus.configuration.liveDeliveryRequested &&
              schedulerStatus.configuration.mode !== "live" ? (
                <p className="mt-1 text-xs text-amber-700">
                  Requested live automation is held in dry-run mode by:{" "}
                  {schedulerStatus.configuration.blockingReasons.join(", ")}.
                </p>
              ) : null}
            </div>
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                schedulerStatus.deadLetterCount > 0
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}
            >
              <span className="font-semibold">
                {schedulerStatus.deadLetterCount} dead-letter
              </span>{" "}
              {schedulerStatus.deadLetterCount === 1 ? "attempt" : "attempts"}
            </div>
          </div>

          {schedulerStatus.lastRun ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Last run</span>
                <span>{formatDateTime(schedulerStatus.lastRun.startedAt)}</span>
                <Badge variant="outline" className="capitalize">
                  {labelFromSnakeCase(schedulerStatus.lastRun.status)}
                </Badge>
                <span>
                  {schedulerStatus.lastRun.dryRun ? "Dry run" : "Live email"}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-6">
                <span>
                  {schedulerStatus.lastRun.scannedIntentCount} scanned
                </span>
                <span>
                  {schedulerStatus.lastRun.candidateAttemptCount} candidates
                </span>
                <span>
                  {schedulerStatus.lastRun.providerCallCount} provider calls
                </span>
                <span>
                  {schedulerStatus.lastRun.retriedAttemptCount} retries
                </span>
                <span>
                  {schedulerStatus.lastRun.deferredRetryCount} deferred
                </span>
                <span>
                  {schedulerStatus.lastRun.preferenceSuppressedCount} suppressed
                </span>
              </div>
              {schedulerStatus.lastRun.errorMessage ? (
                <p className="mt-2 text-xs text-rose-700">
                  {schedulerStatus.lastRun.errorMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
              No scheduled dispatcher run has been recorded yet.
            </p>
          )}

          {schedulerStatus.deadLetterCount > 0 ? (
            <p className="mt-2 text-xs text-rose-700">
              Review the delivery diagnostics below and correct recipient,
              preference, or provider issues. The scheduler will not retry
              dead-letter attempts automatically; escalate for a controlled
              operator requeue after remediation.
            </p>
          ) : null}
        </div>
      ) : null}

      {canDispatchDryRun && deliveryReadiness?.preferences ? (
        <PmNotificationPreferencesPanel
          key={deliveryReadiness.preferences.organizationId}
          preferences={deliveryReadiness.preferences}
        />
      ) : null}

      {canDispatchDryRun ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Send className="h-3.5 w-3.5" />
                Delivery dry run
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {triggerFilter === "all"
                  ? "Scan pending notifications for email and SMS attempts."
                  : `Scan pending ${labelFromSnakeCase(triggerFilter).toLowerCase()} notifications for email and SMS attempts.`}
              </p>
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-700">
                    Last dry run
                  </span>
                  {lastDryRun ? (
                    <>
                      <span>{formatDateTime(lastDryRun.preparedAt)}</span>
                      <span>|</span>
                      <span>{lastDryRunResultLabel(lastDryRun)}</span>
                    </>
                  ) : (
                    <span>
                      No dry-run state has been prepared for this filter.
                    </span>
                  )}
                </div>
                {lastDryRun ? (
                  <div className="mt-2 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-5">
                    <span>{lastDryRun.attemptCount} total attempts</span>
                    <span>{lastDryRun.statusCounts.queued} queued</span>
                    <span>{lastDryRun.statusCounts.skipped} skipped</span>
                    <span>
                      {lastDryRun.missingRecipientCount} missing recipients
                    </span>
                    <span>
                      {lastDryRun.preferenceSuppressedCount} preference
                      suppressed
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {dispatchResult ? (
                <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[310px]">
                  <div className="rounded-md border border-slate-200 px-2 py-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      New
                    </p>
                    <p className="text-sm font-semibold text-slate-950">
                      {dispatchResult.createdAttemptCount}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 px-2 py-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Existing
                    </p>
                    <p className="text-sm font-semibold text-slate-950">
                      {dispatchResult.existingAttemptCount}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 px-2 py-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Skipped
                    </p>
                    <p className="text-sm font-semibold text-slate-950">
                      {dispatchResult.skippedAttemptCount}
                    </p>
                  </div>
                </div>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={() => void runDeliveryDryRun()}
                disabled={isDispatchingDryRun || isLoading}
              >
                {isDispatchingDryRun ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Run dry run
              </Button>
            </div>
          </div>
          {dispatchResult ? (
            <p className="mt-2 text-xs text-slate-500">
              Scanned {dispatchResult.scannedIntentCount} pending notification
              {dispatchResult.scannedIntentCount === 1 ? "" : "s"} and prepared{" "}
              {dispatchResult.candidateAttemptCount} channel attempt
              {dispatchResult.candidateAttemptCount === 1 ? "" : "s"}.
              {dispatchResult.missingRecipientCount > 0
                ? ` ${dispatchResult.missingRecipientCount} missing recipient ${dispatchResult.missingRecipientCount === 1 ? "address was" : "addresses were"} skipped.`
                : ""}
              {dispatchResult.preferenceSuppressedCount > 0
                ? ` ${dispatchResult.preferenceSuppressedCount} attempt${dispatchResult.preferenceSuppressedCount === 1 ? " was" : "s were"} suppressed by organization rules.`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

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
                        diagnostics
                      />
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                        <div>
                          <span className="font-medium text-slate-700">
                            Asset:
                          </span>{" "}
                          {assetLabel(notification)}
                        </div>
                        <div>
                          <span className="font-medium text-slate-700">
                            Window:
                          </span>{" "}
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Send,
  Settings2,
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
import { PmNotificationDryRunAction } from "@/components/notifications/pm-notification-dry-run-action";
import { PmNotificationManualEmailPilotPanel } from "@/components/notifications/pm-notification-manual-email-pilot-panel";
import { runPmNotificationDryRun } from "@/lib/preventive-maintenance-notification-dry-run-client";
import {
  runPmNotificationManualEmailPilot,
  type PmNotificationManualEmailPilotResponse,
} from "@/lib/preventive-maintenance-manual-email-pilot-client";
import { PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP } from "@/lib/preventive-maintenance-manual-email-pilot-policy";
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
type NotificationCenterView = "updates" | "communication";

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
    batchLimitControl: {
      source: "default" | "environment";
      configuredValue: string | null;
      clamped: boolean;
    };
    organizationScope: {
      mode: "all" | "allowlist";
      organizationIds: string[];
      organizationCount: number;
      invalidOrganizationIds: string[];
    };
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
  { value: "dismissed", label: "Closed" },
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

function notificationStatusLabel(status: PmNotificationStatus) {
  if (status === "dismissed") {
    return "Closed";
  }

  return labelFromSnakeCase(status);
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
    return "No updates checked";
  }

  if (issueCount > 0) {
    return `${readyCount} ready, ${issueCount} need review`;
  }

  return `${readyCount} ready with contact details available`;
}

function schedulerModeLabel(mode: PmNotificationSchedulerStatus["configuration"]["mode"]) {
  switch (mode) {
    case "live":
      return "Sending";
    case "dry_run":
      return "Preview mode";
    case "disabled":
      return "Paused";
    default:
      return labelFromSnakeCase(mode);
  }
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
  const [activeView, setActiveView] =
    useState<NotificationCenterView>("updates");
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
  const [isSendingCanary, setIsSendingCanary] = useState(false);
  const [canaryConfirmed, setCanaryConfirmed] = useState(false);
  const [canaryResult, setCanaryResult] =
    useState<PmNotificationCanaryResponse | null>(null);
  const [selectedPilotIds, setSelectedPilotIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pilotConfirmed, setPilotConfirmed] = useState(false);
  const [isSendingPilot, setIsSendingPilot] = useState(false);
  const [pilotResult, setPilotResult] =
    useState<PmNotificationManualEmailPilotResponse | null>(null);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const notificationRequestIdRef = useRef(0);
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
      const requestId = ++notificationRequestIdRef.current;

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
              ? (body.error ?? "Unable to load maintenance updates.")
              : "Unable to load maintenance updates.",
          );
        }

        if (requestId !== notificationRequestIdRef.current) {
          return;
        }

        setNotifications(body.notifications);
        setPendingCount(body.pendingCount);
        setFilteredCount(body.filteredCount);
        setStatusCounts(body.statusCounts);
        setLastDryRun(body.lastDryRun);
        setDeliveryReadiness(body.deliveryReadiness);
        setSchedulerStatus(body.schedulerStatus);
        const visiblePendingIds = new Set(
          body.notifications
            .filter((notification) => notification.status === "pending")
            .map((notification) => notification.id),
        );
        setSelectedPilotIds((current) => {
          const next = new Set(
            [...current].filter((notificationId) =>
              visiblePendingIds.has(notificationId),
            ),
          );
          return next.size === current.size ? current : next;
        });
      } catch (requestError) {
        if (requestId !== notificationRequestIdRef.current) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load maintenance updates.",
        );
      } finally {
        if (requestId === notificationRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
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
          throw new Error(body.error ?? "Unable to close this update.");
        }

        await fetchNotifications({ silent: true });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to close this update.",
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
            ? (body.error ?? "Unable to close the selected updates.")
            : "Unable to close the selected updates.",
        );
      }

      await fetchNotifications({ silent: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to close the selected updates.",
      );
    } finally {
      setIsBulkDismissing(false);
    }
  }, [fetchNotifications, statusFilter, triggerFilter]);

  const runDeliveryDryRun = useCallback(async () => {
    const body = await runPmNotificationDryRun({
      triggerType: triggerFilter === "all" ? undefined : triggerFilter,
    });

    await fetchNotifications({ silent: true });
    return body;
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
            ? (body.error ?? "Unable to send the internal test email.")
            : "Unable to send the internal test email.",
        );
      }

      setCanaryResult(body);
      setCanaryConfirmed(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send the internal test email.",
      );
    } finally {
      setIsSendingCanary(false);
    }
  }, [canaryConfirmed]);

  const togglePilotSelection = useCallback(
    (notificationId: string, checked: boolean) => {
      setSelectedPilotIds((current) => {
        const next = new Set(current);
        if (checked) {
          if (
            next.size >= PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP
          ) {
            return current;
          }
          next.add(notificationId);
        } else {
          next.delete(notificationId);
        }
        return next;
      });
      setPilotConfirmed(false);
      setPilotResult(null);
    },
    [],
  );

  const resetPilotSelection = useCallback(() => {
    setSelectedPilotIds(new Set());
    setPilotConfirmed(false);
    setPilotResult(null);
  }, []);

  const sendManualEmailPilot = useCallback(async () => {
    setIsSendingPilot(true);
    setError(null);
    setPilotResult(null);

    try {
      const result = await runPmNotificationManualEmailPilot({
        notificationIds: [...selectedPilotIds],
      });
      setPilotResult(result);
      setPilotConfirmed(false);
      setSelectedPilotIds(new Set());
      await fetchNotifications({ silent: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send the selected emails.",
      );
    } finally {
      setIsSendingPilot(false);
    }
  }, [fetchNotifications, selectedPilotIds]);

  const selectedPilotDiagnostics = useMemo(() => {
    const diagnostics = {
      reviewedCount: 0,
      readyCount: 0,
      missingRecipientCount: 0,
      preferenceSuppressedCount: 0,
      otherSuppressedCount: 0,
    };

    for (const notification of notifications) {
      if (!selectedPilotIds.has(notification.id)) {
        continue;
      }

      const dryRunEmailAttempt = notification.deliveryAttempts.find(
        (attempt) => attempt.channel === "email" && attempt.dryRun,
      );
      if (!dryRunEmailAttempt) {
        continue;
      }

      diagnostics.reviewedCount += 1;
      const skipReason = dryRunEmailAttempt.skipReason;
      if (skipReason === "dry_run") {
        diagnostics.readyCount += 1;
      } else if (
        skipReason?.includes("_missing_email") ||
        skipReason?.endsWith("_unavailable")
      ) {
        diagnostics.missingRecipientCount += 1;
      } else if (skipReason?.endsWith("_email_disabled")) {
        diagnostics.preferenceSuppressedCount += 1;
      } else {
        diagnostics.otherSuppressedCount += 1;
      }
    }

    return diagnostics;
  }, [notifications, selectedPilotIds]);

  const canDismissAll =
    !isLoading &&
    !isBulkDismissing &&
    filteredCount > 0 &&
    (statusFilter === "pending" || statusFilter === "all");
  const preferencesBlockCanary =
    deliveryReadiness?.preferences?.emailEnabledRoleCount === 0;
  const showCommunicationSettings = activeView === "communication";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {activeView === "updates"
              ? "Service update review"
              : "Communication settings"}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {activeView === "updates"
              ? "Use this view during the walkthrough to review maintenance work and close handled updates."
              : "Review message previews, controlled email sending, and account communication preferences."}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {[
            { value: "updates", label: "Updates" },
            { value: "communication", label: "Communication settings" },
          ].map((view) => (
            <Button
              key={view.value}
              type="button"
              size="sm"
              variant={activeView === view.value ? "default" : "ghost"}
              className={cn(
                "rounded-md",
                activeView !== view.value && "text-slate-600",
              )}
              onClick={() => {
                setActiveView(view.value as NotificationCenterView);
                if (view.value === "updates") {
                  resetPilotSelection();
                }
              }}
            >
              {view.label}
            </Button>
          ))}
        </div>
      </div>

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
              {notificationStatusLabel(status)}
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {statusCounts[status]}
            </p>
          </div>
        ))}
      </div>

      <div
        className="rounded-lg border border-slate-200 bg-white p-3"
        data-testid="pm-notification-filter-panel"
      >
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
                  onClick={() => {
                    resetPilotSelection();
                    setStatusFilter(filter.value);
                  }}
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
                  onClick={() => {
                    resetPilotSelection();
                    setTriggerFilter(filter.value);
                  }}
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
              Close shown
            </Button>
          </div>
        </div>
      </div>

      {showCommunicationSettings && canDispatchDryRun ? (
        <div
          className="rounded-lg border border-slate-200 bg-white p-3"
          data-testid="pm-delivery-dry-run-panel"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Send className="h-3.5 w-3.5" />
                Message preview
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {triggerFilter === "all"
                  ? "Check pending updates before any email is sent."
                  : `Check pending ${labelFromSnakeCase(triggerFilter).toLowerCase()} updates before any email is sent.`}
              </p>
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-700">
                    Last preview
                  </span>
                  {lastDryRun ? (
                    <>
                      <span>{formatDateTime(lastDryRun.preparedAt)}</span>
                      <span>|</span>
                      <span>{lastDryRunResultLabel(lastDryRun)}</span>
                    </>
                  ) : (
                    <span>
                      No preview has been run for this filter.
                    </span>
                  )}
                </div>
                {lastDryRun ? (
                  <div className="mt-2 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-5">
                    <span>{lastDryRun.attemptCount} updates checked</span>
                    <span>{lastDryRun.statusCounts.queued} ready to send</span>
                    <span>{lastDryRun.statusCounts.skipped} held back</span>
                    <span>
                      {lastDryRun.missingRecipientCount} missing contacts
                    </span>
                    <span>
                      {lastDryRun.preferenceSuppressedCount} blocked by
                      preferences
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <PmNotificationDryRunAction
              key={triggerFilter}
              runDryRun={runDeliveryDryRun}
            />
          </div>
        </div>
      ) : null}

      {showCommunicationSettings && canDispatchDryRun && deliveryReadiness ? (
        <PmNotificationManualEmailPilotPanel
          selectedCount={selectedPilotIds.size}
          diagnostics={selectedPilotDiagnostics}
          liveEmailReadiness={deliveryReadiness.liveEmail}
          confirmationChecked={pilotConfirmed}
          isSending={isSendingPilot}
          result={pilotResult}
          onConfirmationChange={setPilotConfirmed}
          onSend={() => void sendManualEmailPilot()}
        />
      ) : null}

      {showCommunicationSettings && canDispatchDryRun && deliveryReadiness ? (
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
                  Email sending status
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
                    ? "Email sending available"
                    : deliveryReadiness.liveEmail.status === "incomplete"
                      ? "Needs setup"
                      : "Email sending paused"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {deliveryReadiness.liveEmail.status === "ready"
                  ? "Confirmed emails can be sent from this settings view only after review."
                  : deliveryReadiness.liveEmail.status === "incomplete"
                    ? "Email sending is turned on but the account setup is incomplete."
                    : "Email sending is paused. No maintenance emails will be sent from this account."}
              </p>

              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Email service
                    </span>
                    <span className="text-[11px] font-medium uppercase text-slate-500">
                      {deliveryReadiness.liveEmail.status === "ready"
                        ? "Ready"
                        : deliveryReadiness.liveEmail.status === "incomplete"
                          ? "Needs setup"
                          : "Paused"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Account connection:{" "}
                    {deliveryReadiness.liveEmail.apiKeyConfigured
                      ? "ready"
                      : "missing"}
                    {" | "}
                    Sender:{" "}
                    {deliveryReadiness.liveEmail.fromEmailConfigured
                      ? "ready"
                      : "missing"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Internal test email
                    </span>
                    <span className="text-[11px] font-medium uppercase text-slate-500">
                      {deliveryReadiness.canary.status === "ready"
                        ? "Ready"
                        : deliveryReadiness.canary.status === "incomplete"
                          ? "Needs setup"
                          : "Paused"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Internal test mailbox:{" "}
                    {deliveryReadiness.canary.recipientAddressMasked ??
                      "not set"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      SMS delivery
                    </span>
                    <span className="text-[11px] font-medium uppercase text-slate-500">
                      Not enabled
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    SMS is not enabled for maintenance messages.
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
                      I confirm this sends one internal test email only to{" "}
                      {deliveryReadiness.canary.recipientAddressMasked ??
                        "the internal mailbox"}
                      .
                    </span>
                  </label>
                  {deliveryReadiness.canary.status === "incomplete" ? (
                    <p className="mt-1 pl-6 text-[11px] text-amber-800">
                      Internal test email needs account setup before it can be
                      sent.
                    </p>
                  ) : deliveryReadiness.canary.status === "disabled" ? (
                    <p className="mt-1 pl-6 text-[11px] text-slate-500">
                      Internal test email is paused.
                    </p>
                  ) : preferencesBlockCanary ? (
                    <p className="mt-1 pl-6 text-[11px] text-amber-800">
                      Internal test email is blocked because email is disabled
                      for every recipient group in this account.
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
                  Send internal test
                </Button>
              </div>
              {canaryResult ? (
                <p className="mt-2 text-xs text-emerald-800">
                  Internal test email sent to{" "}
                  {canaryResult.recipientAddressMasked} at{" "}
                  {formatDateTime(canaryResult.sentAt)}. Record ID:{" "}
                  {canaryResult.auditId}.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showCommunicationSettings && canDispatchDryRun && schedulerStatus ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <Settings2 className="h-3.5 w-3.5" />
                  Automatic reminders
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
                  {schedulerModeLabel(schedulerStatus.configuration.mode)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    schedulerStatus.configuration.authorizationConfigured
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700",
                  )}
                >
                  {schedulerStatus.configuration.authorizationConfigured
                    ? "Protected"
                    : "Needs setup"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {schedulerStatus.configuration.enabled
                  ? `${schedulerStatus.configuration.schedule}; reviews up to ${schedulerStatus.configuration.batchLimit} pending updates each run.`
                  : "Automatic reminders are paused. No scheduled maintenance messages will be sent automatically."}
              </p>
              {schedulerStatus.configuration.enabled ? (
                <p className="mt-1 text-xs text-slate-500">
                  Account coverage:{" "}
                  {schedulerStatus.configuration.organizationScope.mode ===
                  "allowlist"
                    ? `${schedulerStatus.configuration.organizationScope.organizationCount} selected account${schedulerStatus.configuration.organizationScope.organizationCount === 1 ? "" : "s"}`
                    : "all accounts"}
                  {schedulerStatus.configuration.batchLimitControl.source ===
                  "environment"
                    ? ". Limit set by account configuration."
                    : "."}
                </p>
              ) : null}
              {schedulerStatus.configuration.liveDeliveryRequested &&
              schedulerStatus.configuration.mode !== "live" ? (
                <p className="mt-1 text-xs text-amber-700">
                  Automatic sending is currently kept in preview mode until all
                  account safeguards are satisfied.
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
                {schedulerStatus.deadLetterCount} failed
              </span>{" "}
              {schedulerStatus.deadLetterCount === 1 ? "message" : "messages"}{" "}
              needing review
            </div>
          </div>

          {schedulerStatus.lastRun ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  Last reminder check
                </span>
                <span>{formatDateTime(schedulerStatus.lastRun.startedAt)}</span>
                <Badge variant="outline" className="capitalize">
                  {labelFromSnakeCase(schedulerStatus.lastRun.status)}
                </Badge>
                <span>
                  {schedulerStatus.lastRun.dryRun
                    ? "Preview only"
                    : "Email sending"}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-6">
                <span>
                  {schedulerStatus.lastRun.scannedIntentCount} checked
                </span>
                <span>
                  {schedulerStatus.lastRun.candidateAttemptCount} ready updates
                </span>
                <span>
                  {schedulerStatus.lastRun.providerCallCount} email sends
                </span>
                <span>
                  {schedulerStatus.lastRun.retriedAttemptCount} retries
                </span>
                <span>
                  {schedulerStatus.lastRun.deferredRetryCount} deferred
                </span>
                <span>
                  {schedulerStatus.lastRun.preferenceSuppressedCount} held back
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
              No automatic reminder check has been recorded yet.
            </p>
          )}

          {schedulerStatus.deadLetterCount > 0 ? (
            <p className="mt-2 text-xs text-rose-700">
              Review the communication records below, correct missing contact
              details or preference settings, then retry only after the issue is
              resolved.
            </p>
          ) : null}
        </div>
      ) : null}

      {showCommunicationSettings &&
      canDispatchDryRun &&
      deliveryReadiness?.preferences ? (
        <PmNotificationPreferencesPanel
          key={deliveryReadiness.preferences.organizationId}
          preferences={deliveryReadiness.preferences}
        />
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
              Loading maintenance updates
            </CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="px-4 py-12 text-center">
              <Inbox className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                No updates match these filters
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Service reminders, assignment changes, start updates,
                completion notes, and cancellations will appear here.
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
                          {notificationStatusLabel(notification.status)}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        {notification.message}
                      </p>
                      {showCommunicationSettings ? (
                        <PmDeliveryAttemptSummary
                          attempts={notification.deliveryAttempts}
                          diagnostics
                        />
                      ) : null}
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
                            Visit status:
                          </span>{" "}
                          {labelFromSnakeCase(notification.event.status)}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-[150px] shrink-0 items-center gap-2 lg:justify-end">
                      {showCommunicationSettings &&
                      canDispatchDryRun &&
                      notification.status === "pending" ? (
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-rose-700"
                            checked={selectedPilotIds.has(notification.id)}
                            onChange={(event) =>
                              togglePilotSelection(
                                notification.id,
                                event.target.checked,
                              )
                            }
                            disabled={
                              isSendingPilot ||
                              (!selectedPilotIds.has(notification.id) &&
                                selectedPilotIds.size >=
                                  PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_BATCH_CAP)
                            }
                            aria-label={`Select ${notification.title} for reviewed email sending`}
                          />
                          Select
                        </label>
                      ) : null}
                      <Button asChild size="sm" variant="outline">
                        <Link href={workspaceHref}>Open visit</Link>
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
                          aria-label={`Close ${notification.title}`}
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

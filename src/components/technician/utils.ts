import type {
  TechnicianIssueSeverity,
  TechnicianJob,
  TechnicianTicketStatus,
} from "@/components/technician/types";

export type JobTabValue = "assigned" | "in_progress" | "completed";

export function formatRelativeTime(dateValue: string): string {
  const timestamp = new Date(dateValue).getTime();

  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }

  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatDateTime(dateValue: string | null): string {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);

  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(dateValue: string): string {
  const date = new Date(dateValue);

  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function severityBadgeClass(severity: TechnicianIssueSeverity): string {
  switch (severity) {
    case "low":
      return "border-slate-300 bg-slate-200 text-slate-800";
    case "medium":
      return "border-yellow-300 bg-yellow-100 text-yellow-800";
    case "high":
      return "border-orange-300 bg-orange-100 text-orange-800";
    case "critical":
      return "border-red-300 bg-red-100 text-red-800";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700";
  }
}

export function statusLabel(status: TechnicianTicketStatus): string {
  return status.replace(/_/g, " ");
}

export function statusBadgeClass(status: TechnicianTicketStatus): string {
  switch (status) {
    case "assigned":
      return "border-blue-300 bg-blue-100 text-blue-800";
    case "technician_enroute":
      return "border-cyan-300 bg-cyan-100 text-cyan-800";
    case "work_in_progress":
      return "border-violet-300 bg-violet-100 text-violet-800";
    case "pending_confirmation":
      return "border-amber-300 bg-amber-100 text-amber-900";
    case "resolved":
    case "closed":
      return "border-emerald-300 bg-emerald-100 text-emerald-800";
    case "reopened":
      return "border-rose-300 bg-rose-100 text-rose-800";
    case "escalated":
      return "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700";
  }
}

export function selectJobsByTab(
  jobs: TechnicianJob[],
  tab: JobTabValue,
): TechnicianJob[] {
  if (tab === "assigned") {
    return jobs.filter((job) => job.status === "assigned");
  }

  if (tab === "in_progress") {
    return jobs.filter(
      (job) =>
        job.status === "technician_enroute" ||
        job.status === "work_in_progress" ||
        job.status === "reopened" ||
        job.status === "escalated",
    );
  }

  return jobs.filter(
    (job) =>
      job.status === "pending_confirmation" ||
      job.status === "resolved" ||
      job.status === "closed",
  );
}

export function googleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

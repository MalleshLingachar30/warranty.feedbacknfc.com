import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  ChartColumn,
  ClipboardList,
  Gauge,
  LifeBuoy,
  Package,
  ShieldCheck,
  Settings,
  Sticker,
  Ticket,
  Users,
  Wrench,
} from "lucide-react";

export const APP_ROLES = [
  "super_admin",
  "manufacturer_admin",
  "service_center_admin",
  "technician",
  "customer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_FALLBACK: AppRole = "customer";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAVIGATION_BY_ROLE: Record<AppRole, NavigationItem[]> = {
  super_admin: [
    { label: "Dashboard", href: "/dashboard", icon: Gauge },
    { label: "Organizations", href: "/dashboard/settings", icon: ShieldCheck },
  ],
  manufacturer_admin: [
    { label: "Dashboard", href: "/dashboard/manufacturer", icon: Gauge },
    { label: "Products", href: "/dashboard/manufacturer/products", icon: Package },
    { label: "Stickers", href: "/dashboard/manufacturer/stickers", icon: Sticker },
    { label: "Tickets", href: "/dashboard/manufacturer/tickets", icon: Ticket },
    {
      label: "Service Network",
      href: "/dashboard/manufacturer/service-network",
      icon: Users,
    },
    { label: "Claims", href: "/dashboard/manufacturer/claims", icon: ClipboardList },
    { label: "Analytics", href: "/dashboard/manufacturer/analytics", icon: ChartColumn },
    { label: "Settings", href: "/dashboard/manufacturer/settings", icon: Settings },
  ],
  service_center_admin: [
    { label: "Dashboard", href: "/dashboard", icon: Gauge },
    { label: "Tickets", href: "/dashboard/tickets", icon: Ticket },
    { label: "Technicians", href: "/dashboard/technicians", icon: Wrench },
    { label: "Claims", href: "/dashboard/claims", icon: ClipboardList },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  technician: [
    { label: "My Jobs", href: "/dashboard/my-jobs", icon: Briefcase },
    { label: "Schedule", href: "/dashboard/schedule", icon: BarChart3 },
    {
      label: "My Performance",
      href: "/dashboard/my-performance",
      icon: ChartColumn,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  customer: [
    { label: "Dashboard", href: "/dashboard/customer", icon: Gauge },
    { label: "My Products", href: "/dashboard/my-products", icon: Package },
    { label: "My Tickets", href: "/dashboard/my-tickets", icon: Ticket },
    { label: "Support", href: "/dashboard/support", icon: LifeBuoy },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
};

export function parseAppRole(role: string | null | undefined): AppRole {
  if (!role) {
    return ROLE_FALLBACK;
  }

  const normalizedRole = role.replace(/^org:/, "");

  if ((APP_ROLES as readonly string[]).includes(normalizedRole)) {
    return normalizedRole as AppRole;
  }

  return ROLE_FALLBACK;
}

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object";
}

function readRoleValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const role = value.find((entry) => typeof entry === "string");
    return typeof role === "string" ? role : null;
  }

  return null;
}

export function parseAppRoleFromClaims(sessionClaims: unknown): AppRole {
  if (!isRecord(sessionClaims)) {
    return ROLE_FALLBACK;
  }

  const directRole = readRoleValue(sessionClaims.role);
  if (directRole) {
    return parseAppRole(directRole);
  }

  const metadata = sessionClaims.metadata;
  if (isRecord(metadata)) {
    const metadataRole = readRoleValue(metadata.role);
    if (metadataRole) {
      return parseAppRole(metadataRole);
    }
  }

  const publicMetadata = sessionClaims.public_metadata;
  if (isRecord(publicMetadata)) {
    const publicRole = readRoleValue(publicMetadata.role);
    if (publicRole) {
      return parseAppRole(publicRole);
    }
  }

  const unsafeMetadata = sessionClaims.unsafe_metadata;
  if (isRecord(unsafeMetadata)) {
    const unsafeRole = readRoleValue(unsafeMetadata.role);
    if (unsafeRole) {
      return parseAppRole(unsafeRole);
    }
  }

  return ROLE_FALLBACK;
}

export function getRoleLabel(role: AppRole): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "manufacturer_admin":
      return "Manufacturer Admin";
    case "service_center_admin":
      return "Service Center Admin";
    case "technician":
      return "Technician";
    case "customer":
      return "Customer";
    default:
      return "User";
  }
}

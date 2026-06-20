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
  "platform_owner",
  "field_super_admin",
  "field_service_admin",
  "manufacturer_admin",
  "service_center_admin",
  "field_dispatcher",
  "field_technician",
  "internal_service_super_admin",
  "internal_service_admin",
  "internal_inward_operator",
  "internal_service_engineer",
  "internal_service_qa",
  "internal_service_stock",
  "internal_label_admin",
  "customer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_FALLBACK: AppRole = "customer";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export type WorkspaceSurface =
  | "platform"
  | "field_service"
  | "internal_services"
  | "manufacturer"
  | "customer";

export const NAVIGATION_BY_ROLE: Record<AppRole, NavigationItem[]> = {
  platform_owner: [
    { label: "Organizations", href: "/dashboard/settings", icon: ShieldCheck },
  ],
  field_super_admin: [
    {
      label: "Dashboard",
      href: "/dashboard/service-center-overview",
      icon: Gauge,
    },
    { label: "Tickets", href: "/dashboard/tickets", icon: Ticket },
    { label: "Technicians", href: "/dashboard/technicians", icon: Wrench },
    { label: "Claims", href: "/dashboard/claims", icon: ClipboardList },
    { label: "Analytics", href: "/dashboard/analytics", icon: ChartColumn },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  field_service_admin: [
    {
      label: "Dashboard",
      href: "/dashboard/service-center-overview",
      icon: Gauge,
    },
    { label: "Tickets", href: "/dashboard/tickets", icon: Ticket },
    { label: "Technicians", href: "/dashboard/technicians", icon: Wrench },
    { label: "Claims", href: "/dashboard/claims", icon: ClipboardList },
    { label: "Analytics", href: "/dashboard/analytics", icon: ChartColumn },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
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
    {
      label: "Internal Services",
      href: "/dashboard/manufacturer/internal-services",
      icon: Wrench,
    },
    { label: "Analytics", href: "/dashboard/manufacturer/analytics", icon: ChartColumn },
    { label: "Settings", href: "/dashboard/manufacturer/settings", icon: Settings },
  ],
  service_center_admin: [
    {
      label: "Dashboard",
      href: "/dashboard/service-center-overview",
      icon: Gauge,
    },
    { label: "Tickets", href: "/dashboard/tickets", icon: Ticket },
    { label: "Technicians", href: "/dashboard/technicians", icon: Wrench },
    { label: "Claims", href: "/dashboard/claims", icon: ClipboardList },
    { label: "Analytics", href: "/dashboard/analytics", icon: ChartColumn },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  field_dispatcher: [
    { label: "Tickets", href: "/dashboard/tickets", icon: Ticket },
    { label: "Technicians", href: "/dashboard/technicians", icon: Users },
    { label: "Analytics", href: "/dashboard/analytics", icon: ChartColumn },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  field_technician: [
    { label: "My Jobs", href: "/dashboard/my-jobs", icon: Briefcase },
    { label: "Schedule", href: "/dashboard/schedule", icon: BarChart3 },
    {
      label: "My Performance",
      href: "/dashboard/my-performance",
      icon: ChartColumn,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  internal_service_super_admin: [
    {
      label: "Internal Services",
      href: "/dashboard/internal-services",
      icon: Gauge,
    },
    { label: "Inward", href: "/dashboard/internal-services/inward", icon: Package },
    { label: "Bench", href: "/dashboard/internal-services/bench", icon: Wrench },
    { label: "QA", href: "/dashboard/internal-services/qa", icon: ClipboardList },
    { label: "Stock", href: "/dashboard/internal-services/stock", icon: Package },
    {
      label: "Analytics",
      href: "/dashboard/internal-services/analytics",
      icon: ChartColumn,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  internal_service_admin: [
    {
      label: "Internal Services",
      href: "/dashboard/internal-services",
      icon: Gauge,
    },
    { label: "Inward", href: "/dashboard/internal-services/inward", icon: Package },
    { label: "Bench", href: "/dashboard/internal-services/bench", icon: Wrench },
    { label: "QA", href: "/dashboard/internal-services/qa", icon: ClipboardList },
    { label: "Stock", href: "/dashboard/internal-services/stock", icon: Package },
    {
      label: "Analytics",
      href: "/dashboard/internal-services/analytics",
      icon: ChartColumn,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  internal_inward_operator: [
    { label: "Inward", href: "/dashboard/internal-services/inward", icon: Package },
    {
      label: "Orders",
      href: "/dashboard/internal-services/orders",
      icon: ClipboardList,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  internal_service_engineer: [
    { label: "Bench", href: "/dashboard/internal-services/bench", icon: Wrench },
    {
      label: "Orders",
      href: "/dashboard/internal-services/orders",
      icon: ClipboardList,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  internal_service_qa: [
    { label: "QA", href: "/dashboard/internal-services/qa", icon: ClipboardList },
    {
      label: "Orders",
      href: "/dashboard/internal-services/orders",
      icon: Package,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  internal_service_stock: [
    { label: "Stock", href: "/dashboard/internal-services/stock", icon: Package },
    {
      label: "Orders",
      href: "/dashboard/internal-services/orders",
      icon: ClipboardList,
    },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ],
  internal_label_admin: [
    { label: "Stickers", href: "/dashboard/manufacturer/stickers", icon: Sticker },
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

  const camelPublicMetadata = sessionClaims.publicMetadata;
  if (isRecord(camelPublicMetadata)) {
    const publicRole = readRoleValue(camelPublicMetadata.role);
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

  const camelUnsafeMetadata = sessionClaims.unsafeMetadata;
  if (isRecord(camelUnsafeMetadata)) {
    const unsafeRole = readRoleValue(camelUnsafeMetadata.role);
    if (unsafeRole) {
      return parseAppRole(unsafeRole);
    }
  }

  return ROLE_FALLBACK;
}

export function getRoleLabel(role: AppRole): string {
  switch (role) {
    case "platform_owner":
      return "Platform Owner";
    case "field_super_admin":
      return "Field Super Admin";
    case "field_service_admin":
      return "Field Service Admin";
    case "manufacturer_admin":
      return "Manufacturer Admin";
    case "service_center_admin":
      return "Service Center Admin";
    case "field_dispatcher":
      return "Field Dispatcher";
    case "field_technician":
      return "Field Technician";
    case "internal_service_super_admin":
      return "Internal Service Super Admin";
    case "internal_service_admin":
      return "Internal Service Admin";
    case "internal_inward_operator":
      return "Internal Inward Operator";
    case "internal_service_engineer":
      return "Internal Service Engineer";
    case "internal_service_qa":
      return "Internal Service QA";
    case "internal_service_stock":
      return "Internal Service Stock";
    case "internal_label_admin":
      return "Internal Label Admin";
    case "customer":
      return "Customer";
    default:
      return "User";
  }
}

export function isFieldTechnicianRole(role: AppRole) {
  return role === "field_technician";
}

export function isFieldAdminRole(role: AppRole) {
  return (
    role === "field_super_admin" ||
    role === "field_service_admin" ||
    role === "service_center_admin" ||
    role === "field_dispatcher"
  );
}

export function isFieldRole(role: AppRole) {
  return isFieldAdminRole(role) || isFieldTechnicianRole(role);
}

export function isInternalServiceRole(role: AppRole) {
  return (
    role === "internal_service_super_admin" ||
    role === "internal_service_admin" ||
    role === "internal_inward_operator" ||
    role === "internal_service_engineer" ||
    role === "internal_service_qa" ||
    role === "internal_service_stock" ||
    role === "internal_label_admin"
  );
}

export function isManufacturerOversightRole(role: AppRole) {
  return role === "manufacturer_admin";
}

export function isPlatformOwnerRole(role: AppRole) {
  return role === "platform_owner";
}

export const SERVICE_CENTER_FIELD_ROLES: AppRole[] = [
  "platform_owner",
  "field_super_admin",
  "field_service_admin",
  "service_center_admin",
  "field_dispatcher",
];

export const INTERNAL_SERVICE_ROLES: AppRole[] = [
  "platform_owner",
  "service_center_admin",
  "internal_service_super_admin",
  "internal_service_admin",
  "internal_inward_operator",
  "internal_service_engineer",
  "internal_service_qa",
  "internal_service_stock",
];

export const MANUFACTURER_WORKSPACE_ROLES: AppRole[] = [
  "platform_owner",
  "manufacturer_admin",
  "internal_label_admin",
];

export function getWorkspaceSurface(role: AppRole): WorkspaceSurface {
  if (role === "customer") {
    return "customer";
  }

  if (role === "manufacturer_admin" || role === "internal_label_admin") {
    return "manufacturer";
  }

  if (
    role === "internal_service_super_admin" ||
    role === "internal_service_admin" ||
    role === "internal_inward_operator" ||
    role === "internal_service_engineer" ||
    role === "internal_service_qa" ||
    role === "internal_service_stock"
  ) {
    return "internal_services";
  }

  if (role === "platform_owner") {
    return "platform";
  }

  return "field_service";
}

export function getWorkspaceTitle(role: AppRole) {
  switch (getWorkspaceSurface(role)) {
    case "platform":
      return "FeedbackNFC | Platform";
    case "field_service":
      return "FeedbackNFC | Field Service";
    case "internal_services":
      return "FeedbackNFC | Internal Services";
    case "manufacturer":
      return "FeedbackNFC | Manufacturer";
    case "customer":
      return "FeedbackNFC | Warranty";
    default:
      return "FeedbackNFC | Warranty";
  }
}

export function getDefaultDashboardPath(role: AppRole) {
  switch (role) {
    case "platform_owner":
      return "/dashboard/settings";
    case "field_super_admin":
    case "field_service_admin":
    case "service_center_admin":
      return "/dashboard/service-center-overview";
    case "field_dispatcher":
      return "/dashboard/tickets";
    case "field_technician":
      return "/dashboard/my-jobs";
    case "manufacturer_admin":
      return "/dashboard/manufacturer";
    case "internal_service_super_admin":
    case "internal_service_admin":
      return "/dashboard/internal-services";
    case "internal_inward_operator":
      return "/dashboard/internal-services/inward";
    case "internal_service_engineer":
      return "/dashboard/internal-services/bench";
    case "internal_service_qa":
      return "/dashboard/internal-services/qa";
    case "internal_service_stock":
      return "/dashboard/internal-services/stock";
    case "internal_label_admin":
      return "/dashboard/manufacturer/stickers";
    case "customer":
      return "/dashboard/customer";
    default:
      return "/dashboard";
  }
}

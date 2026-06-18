"use client";

import { InternalServicesSubNav } from "@/components/internal-services/sub-nav";

const items = [
  { label: "Overview", href: "/dashboard/manufacturer/internal-services" },
  { label: "Inward Receipt", href: "/dashboard/manufacturer/internal-services/inward" },
  { label: "Orders", href: "/dashboard/manufacturer/internal-services/orders" },
  { label: "QA & Calibration", href: "/dashboard/manufacturer/internal-services/qa" },
  { label: "Disposition", href: "/dashboard/manufacturer/internal-services/disposition" },
  { label: "Analytics", href: "/dashboard/manufacturer/internal-services/analytics" },
  { label: "Settings", href: "/dashboard/manufacturer/internal-services/settings" },
];

export function ManufacturerInternalServicesSubNav() {
  return <InternalServicesSubNav items={items} />;
}

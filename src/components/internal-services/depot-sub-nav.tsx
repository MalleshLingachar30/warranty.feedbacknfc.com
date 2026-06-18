"use client";

import { InternalServicesSubNav } from "@/components/internal-services/sub-nav";

const items = [
  { label: "Overview", href: "/dashboard/internal-services" },
  { label: "Inward Receipt", href: "/dashboard/internal-services/inward" },
  { label: "Orders", href: "/dashboard/internal-services/orders" },
  { label: "Bench Queue", href: "/dashboard/internal-services/bench" },
  { label: "QA & Calibration", href: "/dashboard/internal-services/qa" },
  { label: "Stock Release", href: "/dashboard/internal-services/stock" },
  { label: "Analytics", href: "/dashboard/internal-services/analytics" },
];

export function DepotInternalServicesSubNav() {
  return <InternalServicesSubNav items={items} />;
}

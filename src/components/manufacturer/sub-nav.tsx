"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { label: "Overview", href: "/dashboard/manufacturer" },
  { label: "Products", href: "/dashboard/manufacturer/products" },
  { label: "Stickers", href: "/dashboard/manufacturer/stickers" },
  { label: "Sales", href: "/dashboard/manufacturer/sales" },
  { label: "Installations", href: "/dashboard/manufacturer/installations" },
  { label: "Tickets", href: "/dashboard/manufacturer/tickets" },
  {
    label: "Service Network",
    href: "/dashboard/manufacturer/service-network",
  },
  { label: "Claims", href: "/dashboard/manufacturer/claims" },
  { label: "Analytics", href: "/dashboard/manufacturer/analytics" },
  { label: "Settings", href: "/dashboard/manufacturer/settings" },
];

function isItemActive(pathname: string, href: string) {
  if (href === "/dashboard/manufacturer") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ManufacturerSubNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 overflow-x-auto border-b pb-3">
      <nav className="flex min-w-max items-center gap-2">
        {items.map((item) => {
          const active = isItemActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

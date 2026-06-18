"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type InternalServicesSubNavItem = {
  label: string;
  href: string;
};

function isItemActive(pathname: string, href: string) {
  if (pathname === href) {
    return true;
  }

  return pathname.startsWith(`${href}/`);
}

export function InternalServicesSubNav({
  items,
}: {
  items: InternalServicesSubNavItem[];
}) {
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

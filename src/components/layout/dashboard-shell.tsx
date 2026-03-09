"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { SignOutButton, UserButton } from "@clerk/nextjs";

import { OfflineBanner } from "@/components/pwa/offline-banner";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAVIGATION_BY_ROLE, type AppRole, getRoleLabel } from "@/lib/roles";

interface DashboardShellProps {
  role: AppRole;
  organizationName?: string | null;
  children: React.ReactNode;
}

function SidebarNav({
  role,
  onNavigate,
}: {
  role: AppRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const navItems = NAVIGATION_BY_ROLE[role] ?? [];

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  role,
  organizationName,
  children,
}: DashboardShellProps) {
  const roleLabel = getRoleLabel(role);

  return (
    <div className="min-h-screen bg-slate-100">
      <PwaInstallPrompt role={role} />
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-slate-200 bg-white px-4 py-6 md:block">
          <div className="mb-6 px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              FeedbackNFC | Warranty
            </p>
            {organizationName ? (
              <p className="text-sm font-medium text-slate-700">
                {organizationName}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
          <Separator className="mb-4" />
          <SidebarNav role={role} />
        </aside>

        <div className="flex flex-1 flex-col">
          <OfflineBanner />
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="md:hidden">
                      <Menu className="h-4 w-4" />
                      <span className="sr-only">Open navigation</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[280px]">
                    <SheetHeader>
                      <SheetTitle>FeedbackNFC | Warranty</SheetTitle>
                      <SheetDescription>
                        {organizationName ? (
                          <span className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-slate-700">
                              {organizationName}
                            </span>
                            <span>{roleLabel}</span>
                          </span>
                        ) : (
                          roleLabel
                        )}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6">
                      <SidebarNav role={role} />
                    </div>
                  </SheetContent>
                </Sheet>
                <div>
                  <p className="text-sm font-semibold text-slate-900 md:text-base">
                    FeedbackNFC | Warranty
                  </p>
                  <p className="text-xs text-slate-500 md:hidden">
                    {organizationName ?? "Dashboard"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SignOutButton redirectUrl="/sign-in">
                  <Button variant="outline" size="sm">
                    Sign out
                  </Button>
                </SignOutButton>
                <UserButton />
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

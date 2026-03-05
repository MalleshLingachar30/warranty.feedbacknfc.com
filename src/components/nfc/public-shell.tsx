import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface NfcPublicShellProps {
  title: string;
  description: string;
  children?: ReactNode;
  footer?: ReactNode;
  subtitle?: string;
  headerActions?: ReactNode;
}

export function NfcPublicShell({
  title,
  description,
  children,
  footer,
  subtitle = "Warranty Smart Sticker",
  headerActions,
}: NfcPublicShellProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50 px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <header className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
                  FeedbackNFC
                </p>
                <p className="text-sm text-slate-600">{subtitle}</p>
              </div>
            </div>
            {headerActions ? <div>{headerActions}</div> : null}
          </div>
        </header>

        <Card className="border-slate-200 shadow-md">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
              <p className="text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
            {children}
          </CardContent>
        </Card>

        {footer ? (
          <footer className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
            {footer}
          </footer>
        ) : null}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Smartphone } from "lucide-react";

import type { AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "warranty-pwa-install-dismissed-until";
const PROMPT_ROLES = new Set<AppRole>(["technician", "service_center_admin"]);

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function getDismissedUntil() {
  const rawValue = window.localStorage.getItem(DISMISS_KEY);
  const parsedValue = Number.parseInt(rawValue ?? "", 10);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function PwaInstallPrompt({ role }: { role: AppRole }) {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const shouldRenderForRole = useMemo(() => PROMPT_ROLES.has(role), [role]);

  useEffect(() => {
    if (!shouldRenderForRole) {
      return;
    }

    if (isStandaloneMode() || !isMobileViewport()) {
      return;
    }

    if (Date.now() < getDismissedUntil()) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setInstallEvent(null);
      setIsVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [shouldRenderForRole]);

  const handleDismiss = () => {
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(DISMISS_KEY, String(sevenDaysFromNow));
    setIsVisible(false);
  };

  const handleInstall = async () => {
    if (!installEvent) {
      return;
    }

    setIsInstalling(true);

    try {
      await installEvent.prompt();
      const result = await installEvent.userChoice;

      if (result.outcome === "accepted") {
        setIsVisible(false);
        setInstallEvent(null);
        window.localStorage.removeItem(DISMISS_KEY);
        return;
      }

      handleDismiss();
    } finally {
      setIsInstalling(false);
    }
  };

  if (!shouldRenderForRole || !isVisible || !installEvent) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
      <div className="rounded-3xl border border-blue-200 bg-white p-4 shadow-2xl shadow-blue-950/10">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Install FeedbackNFC Warranty
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Add this app to your home screen for faster job access, offline
              photo capture, and technician notifications.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            className="h-11 flex-1"
            onClick={() => void handleInstall()}
            disabled={isInstalling}
          >
            <Download className="h-4 w-4" />
            {isInstalling ? "Installing..." : "Install App"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={handleDismiss}
          >
            Maybe Later
          </Button>
        </div>
      </div>
    </div>
  );
}

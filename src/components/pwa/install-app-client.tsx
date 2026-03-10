"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Globe,
  Share2,
  Smartphone,
} from "lucide-react";

import type { AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DevicePlatform = "android" | "ios" | "desktop" | "other_mobile";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

function detectPlatform(userAgent: string): DevicePlatform {
  const ua = userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) {
    return "ios";
  }

  if (/android/.test(ua)) {
    return "android";
  }

  if (/mobile/.test(ua)) {
    return "other_mobile";
  }

  return "desktop";
}

function isInAppBrowser(userAgent: string) {
  return /instagram|fban|fbav|messenger|line|wv|snapchat|micromessenger/.test(
    userAgent.toLowerCase(),
  );
}

function getTargetPath(role: AppRole | null, nextPath: string) {
  if (role === "technician") {
    return "/dashboard/my-jobs";
  }

  if (role === "service_center_admin") {
    return "/dashboard";
  }

  return nextPath;
}

export function InstallAppClient(props: {
  currentRole: AppRole | null;
  inviteRole: AppRole | null;
  nextPath: string;
}) {
  const [platform] = useState<DevicePlatform>(() => {
    if (typeof navigator === "undefined") {
      return "desktop";
    }

    return detectPlatform(navigator.userAgent);
  });
  const [standalone] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(display-mode: standalone)").matches;
  });
  const [inAppBrowser] = useState(() => {
    if (typeof navigator === "undefined") {
      return false;
    }

    return isInAppBrowser(navigator.userAgent);
  });
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [refreshHref] = useState(() => {
    if (typeof window === "undefined") {
      return "/install-app";
    }

    return window.location.href;
  });

  const targetPath = useMemo(
    () => getTargetPath(props.currentRole ?? props.inviteRole, props.nextPath),
    [props.currentRole, props.inviteRole, props.nextPath],
  );

  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(
    `/install-app?next=${encodeURIComponent(props.nextPath)}${
      props.inviteRole ? `&role=${props.inviteRole}` : ""
    }`,
  )}`;

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const installOnAndroid = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-700">
            FeedbackNFC Warranty
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Install on Your Phone
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Open the warranty workspace in your mobile browser and add it to your
            home screen. No App Store or Play Store download is required.
          </p>
        </div>

        {inAppBrowser ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Open this page in {platform === "ios" ? "Safari" : "Chrome"} for the
            smoothest install experience. In-app browsers often block PWA install
            flows.
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Smartphone className="h-5 w-5 text-blue-700" />
              {platform === "ios"
                ? "iPhone / iPad"
                : platform === "android"
                  ? "Android"
                  : "Phone Install"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-700">
            {standalone ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                This app is already installed on this device.
              </div>
            ) : null}

            {platform === "ios" ? (
              <div className="space-y-3">
                <p className="font-medium text-slate-900">
                  Install using Safari:
                </p>
                <ol className="space-y-2 text-slate-700">
                  <li>1. Open this page in Safari.</li>
                  <li>
                    2. Tap the <Share2 className="mx-1 inline h-4 w-4" /> Share
                    button.
                  </li>
                  <li>3. Tap “Add to Home Screen”.</li>
                </ol>
              </div>
            ) : null}

            {platform === "android" ? (
              <div className="space-y-3">
                <p className="font-medium text-slate-900">
                  Install using Chrome:
                </p>
                <ol className="space-y-2 text-slate-700">
                  <li>1. Open this page in Chrome on Android.</li>
                  <li>2. Sign in if needed.</li>
                  <li>3. Tap Install when your browser offers it.</li>
                </ol>
                {installPrompt ? (
                  <Button onClick={() => void installOnAndroid()}>
                    <Download className="h-4 w-4" />
                    Install App
                  </Button>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
                    If Chrome does not show the prompt immediately, open the
                    browser menu and choose “Add to Home screen” or “Install app”.
                  </div>
                )}
              </div>
            ) : null}

            {platform === "desktop" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
                Open this page on your phone for the install flow. Desktop can
                also install the app, but the technician experience is designed for
                mobile.
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              {props.currentRole ? (
                <Button asChild>
                  <Link href={targetPath}>
                    Open Warranty Workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href={signInHref}>
                    Sign in to Continue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}

              <Button variant="outline" asChild>
                <a href={refreshHref}>
                  <Globe className="h-4 w-4" />
                  Refresh Instructions
                </a>
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              This is a web app. Users keep the no-app-download experience while
              still getting a home-screen shortcut and app-like behavior.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

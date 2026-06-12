"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading, SignUp, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { parseAppRoleFromClaims } from "@/lib/roles";

const clerkPublicAuthEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

const loadingState = (
  <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
    Loading sign-up...
  </div>
);

const unavailableState = (
  <div className="w-full max-w-md rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 shadow-sm">
    <p className="font-semibold">Sign-up is temporarily unavailable.</p>
    <p className="mt-2">
      We could not load the authentication service. Please try again in a moment
      or contact support.
    </p>
  </div>
);

function getRedirectTarget(searchParams: URLSearchParams): string {
  return (
    searchParams.get("redirect_url") ??
    searchParams.get("redirectUrl") ??
    "/dashboard"
  );
}

function SignUpCard() {
  const { userId, isLoaded: authLoaded, sessionClaims } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = useMemo(
    () => getRedirectTarget(searchParams),
    [searchParams],
  );
  const resolvedRedirectTarget = useMemo(() => {
    if (redirectTarget !== "/dashboard") {
      return redirectTarget;
    }

    const role = parseAppRoleFromClaims(sessionClaims);

    switch (role) {
      case "manufacturer_admin":
        return "/dashboard/manufacturer/integrations";
      case "super_admin":
        return "/dashboard/settings";
      default:
        return redirectTarget;
    }
  }, [redirectTarget, sessionClaims]);

  useEffect(() => {
    if (!authLoaded || !userId) {
      return;
    }

    let isActive = true;

    const bootstrapSession = async () => {
      try {
        await fetch("/api/auth/client-trust", {
          method: "POST",
        });
      } catch (error) {
        console.error("Failed to bootstrap Clerk user session", error);
      }

      if (isActive) {
        router.replace(resolvedRedirectTarget);
      }
    };

    void bootstrapSession();

    return () => {
      isActive = false;
    };
  }, [authLoaded, resolvedRedirectTarget, router, userId]);

  if (authLoaded && userId) {
    return (
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
        Redirecting to your account...
      </div>
    );
  }

  return (
    <SignUp
      fallback={loadingState}
      fallbackRedirectUrl={resolvedRedirectTarget}
      path="/sign-up"
      routing="path"
      signInFallbackRedirectUrl={resolvedRedirectTarget}
      signInUrl="/sign-in"
    />
  );
}

export default function SignUpPage() {
  if (!clerkPublicAuthEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold">Authentication is not configured.</p>
          <p className="mt-2">
            This environment is missing the Clerk publishable key, so sign-up
            cannot start yet.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <ClerkLoading>{loadingState}</ClerkLoading>
      <ClerkFailed>{unavailableState}</ClerkFailed>
      <ClerkLoaded>
        <SignUpCard />
      </ClerkLoaded>
    </main>
  );
}

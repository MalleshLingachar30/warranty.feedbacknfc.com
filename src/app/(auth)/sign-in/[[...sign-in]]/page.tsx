"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

const clerkPublicAuthEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

const loadingState = (
  <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
    Loading sign-in...
  </div>
);

const unavailableState = (
  <div className="w-full max-w-md rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 shadow-sm">
    <p className="font-semibold">Sign-in is temporarily unavailable.</p>
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

function SignInCard() {
  const { userId, isLoaded: authLoaded } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = useMemo(
    () => getRedirectTarget(searchParams),
    [searchParams],
  );
  const resolvedRedirectTarget = useMemo(
    () => (redirectTarget === "/dashboard" ? "/dashboard" : redirectTarget),
    [redirectTarget],
  );

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
    <SignIn
      fallback={loadingState}
      fallbackRedirectUrl={resolvedRedirectTarget}
      path="/sign-in"
      routing="path"
      signUpFallbackRedirectUrl={resolvedRedirectTarget}
      signUpUrl="/sign-up"
    />
  );
}

export default function SignInPage() {
  if (!clerkPublicAuthEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold">Authentication is not configured.</p>
          <p className="mt-2">
            This environment is missing the Clerk publishable key, so sign-in
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
        <SignInCard />
      </ClerkLoaded>
    </main>
  );
}

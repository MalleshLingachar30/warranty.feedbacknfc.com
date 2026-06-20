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

const operatorGuidance = (
  <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
      Choose Your Workspace
    </p>
    <h2 className="mt-3 text-2xl font-semibold text-slate-900">
      Two operator flows, one manufacturing platform
    </h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">
      Sign in with the account assigned to your work surface. Field Service and
      Internal Services are intentionally separated so technicians, depot
      engineers, QA staff, and label operators only see the workflow they own.
    </p>
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Field Service</p>
        <p className="mt-2 text-sm text-slate-600">
          Use for customer tickets, technician jobs, dispatch, travel, repair,
          and ticket closure.
        </p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          Roles
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Field Service Admin, Field Dispatcher, Field Technician
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Internal Services</p>
        <p className="mt-2 text-sm text-slate-600">
          Use for inward receipt, bench repair, QA, stock disposition, and
          sticker-led internal service work.
        </p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          Roles
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Internal Services Super Admin, Inward Operator, Bench Engineer, QA,
          Stock, Label Admin
        </p>
      </div>
    </div>
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      If your screen looks wrong after sign-in, sign out and use the account
      assigned to the correct workspace instead of reusing a mixed-purpose
      login.
    </div>
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
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        {operatorGuidance}
        <div className="flex justify-center lg:justify-end">
          <ClerkLoading>{loadingState}</ClerkLoading>
          <ClerkFailed>{unavailableState}</ClerkFailed>
          <ClerkLoaded>
            <SignInCard />
          </ClerkLoaded>
        </div>
      </div>
    </main>
  );
}

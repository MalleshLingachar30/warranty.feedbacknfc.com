"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading, SignUp, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

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

const signUpGuidance = (
  <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
      Account Guidance
    </p>
    <h2 className="mt-3 text-2xl font-semibold text-slate-900">
      Operators should use assigned company accounts
    </h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">
      Field Service and Internal Services now run as separate operator
      workspaces. New admin, engineer, QA, stock, and label users should be
      created by your company admin so they land in the correct dashboard from
      day one.
    </p>
    <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <p>
        <span className="font-semibold text-slate-900">Field Service:</span>{" "}
        technician jobs, dispatch, service-center operations, and customer
        tickets.
      </p>
      <p>
        <span className="font-semibold text-slate-900">
          Internal Services:
        </span>{" "}
        inward receipt, bench repair, QA, stock release, and label generation.
      </p>
      <p>
        Customer self-service accounts can still sign up here, but operator
        accounts should normally be handed out by the manufacturer or field
        admin team.
      </p>
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

function SignUpCard() {
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
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        {signUpGuidance}
        <div className="flex justify-center lg:justify-end">
          <ClerkLoading>{loadingState}</ClerkLoading>
          <ClerkFailed>{unavailableState}</ClerkFailed>
          <ClerkLoaded>
            <SignUpCard />
          </ClerkLoaded>
        </div>
      </div>
    </main>
  );
}

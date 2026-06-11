"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  useAuth,
  useSignIn,
} from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseAppRoleFromClaims } from "@/lib/roles";

import {
  continuationAppearance,
  getErrorMessage,
  getRedirectTarget,
  getTaskPath,
  withSearchParams,
} from "../../auth-flow-helpers";

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

function SignInCard() {
  const { userId, isLoaded: authLoaded, sessionClaims } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const pathname = usePathname();
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoaded || !userId) {
      return;
    }

    router.replace(resolvedRedirectTarget);
  }, [authLoaded, resolvedRedirectTarget, router, userId]);

  if (authLoaded && userId) {
    return (
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
        Redirecting to your account...
      </div>
    );
  }

  if (!signIn) {
    return loadingState;
  }

  const isSubmitting = fetchStatus === "fetching";
  const shouldRenderClerkContinuation =
    pathname !== "/sign-in" ||
    signIn.status === "needs_second_factor" ||
    signIn.status === "needs_client_trust" ||
    signIn.status === "needs_new_password";

  const finalizeSignIn = async () => {
    const { error } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        const taskPath = session?.currentTask
          ? getTaskPath("/sign-in", session.currentTask.key)
          : null;

        if (taskPath) {
          router.push(withSearchParams(taskPath, searchParams));
          return;
        }

        const url = decorateUrl(resolvedRedirectTarget);
        if (url.startsWith("http")) {
          window.location.href = url;
          return;
        }

        router.push(url);
      },
    });

    if (error) {
      setErrorMessage(
        getErrorMessage(error, "Sign-in failed. Please try again."),
      );
    }
  };

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const { error } = await signIn.password({
      emailAddress: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(
        getErrorMessage(error, "Sign-in failed. Please try again."),
      );
      return;
    }

    if (signIn.status === "complete") {
      await finalizeSignIn();
      return;
    }
  };

  if (shouldRenderClerkContinuation) {
    return (
      <SignIn
        appearance={continuationAppearance}
        fallback={loadingState}
        fallbackRedirectUrl={resolvedRedirectTarget}
        path="/sign-in"
        routing="path"
        signUpFallbackRedirectUrl={resolvedRedirectTarget}
        signUpUrl="/sign-up"
      />
    );
  }

  const fieldErrorMessage =
    errors.fields.identifier?.message ?? errors.fields.password?.message;

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="p-6">
        <h1 className="text-center text-3xl font-semibold text-slate-900">
          Sign in
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Continue with your email and password.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleCredentialsSubmit}>
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="email"
            >
              Email address
            </label>
            <input
              autoComplete="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="password"
            >
              Password
            </label>
            <input
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {fieldErrorMessage ? (
            <p className="text-sm text-rose-700">{fieldErrorMessage}</p>
          ) : null}
          {errorMessage ? (
            <p className="text-sm text-rose-700">{errorMessage}</p>
          ) : null}
          <button
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Continue"}
          </button>
        </form>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-center text-sm text-slate-600">
        Don&apos;t have an account?{" "}
        <Link
          className="font-semibold text-slate-800 hover:text-slate-950"
          href="/sign-up"
        >
          Sign up
        </Link>
      </div>
    </div>
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

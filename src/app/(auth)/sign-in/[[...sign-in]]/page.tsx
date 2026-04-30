"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  useSignIn,
} from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

const loadingState = (
  <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
    Loading sign-in...
  </div>
);

const unavailableState = (
  <div className="w-full max-w-md rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 shadow-sm">
    <p className="font-semibold">Sign-in is temporarily unavailable.</p>
    <p className="mt-2">
      We could not load the authentication service. Please try again in a
      moment or contact support.
    </p>
  </div>
);

function getRedirectTarget(searchParams: { get: (key: string) => string | null }): string {
  return (
    searchParams.get("redirect_url") ??
    searchParams.get("redirectUrl") ??
    "/dashboard"
  );
}

function getErrorMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    return (
      error.errors[0]?.longMessage ??
      error.errors[0]?.message ??
      "Sign-in failed. Please try again."
    );
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Sign-in failed. Please try again.";
}

function SignInCard() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = useMemo(
    () => getRedirectTarget(searchParams),
    [searchParams],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"credentials" | "verify">("credentials");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSubmitting = fetchStatus === "fetching";

  const finalizeSignIn = async () => {
    const { error } = await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl(redirectTarget);
        if (url.startsWith("http")) {
          window.location.href = url;
          return;
        }
        router.push(url);
      },
    });

    if (error) {
      setErrorMessage(getErrorMessage(error));
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
      setErrorMessage(getErrorMessage(error));
      return;
    }

    if (signIn.status === "complete") {
      await finalizeSignIn();
      return;
    }

    if (
      (signIn.status === "needs_second_factor" ||
        signIn.status === "needs_client_trust") &&
      signIn.supportedSecondFactors.some(
        (factor) => factor.strategy === "email_code",
      )
    ) {
      const result = await signIn.mfa.sendEmailCode();
      if (result.error) {
        setErrorMessage(getErrorMessage(result.error));
        return;
      }
      setStep("verify");
      return;
    }

    setErrorMessage("Additional verification is required for this account.");
  };

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });

    if (error) {
      setErrorMessage(getErrorMessage(error));
      return;
    }

    if (signIn.status === "complete") {
      await finalizeSignIn();
      return;
    }

    setErrorMessage("Verification did not complete. Please try again.");
  };

  const handleResendCode = async () => {
    setErrorMessage(null);
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const fieldErrorMessage =
    step === "credentials"
      ? errors.fields.identifier?.message ?? errors.fields.password?.message
      : errors.fields.code?.message;

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="p-6">
        <h1 className="text-center text-3xl font-semibold text-slate-900">
          Sign in
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Continue with your email and password.
        </p>

        {step === "credentials" ? (
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
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleVerifySubmit}>
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="code"
              >
                Verification code
              </label>
              <input
                autoComplete="one-time-code"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                id="code"
                name="code"
                onChange={(event) => setCode(event.target.value)}
                required
                type="text"
                value={code}
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
              {isSubmitting ? "Verifying..." : "Verify and continue"}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                className="font-medium text-slate-700 transition hover:text-slate-900"
                onClick={handleResendCode}
                type="button"
              >
                Resend code
              </button>
              <button
                className="font-medium text-slate-700 transition hover:text-slate-900"
                onClick={() => {
                  void signIn.reset();
                  setStep("credentials");
                  setCode("");
                  setErrorMessage(null);
                }}
                type="button"
              >
                Start over
              </button>
            </div>
          </form>
        )}
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

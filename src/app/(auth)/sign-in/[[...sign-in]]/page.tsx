import {
  ClerkDegraded,
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  SignIn,
} from "@clerk/nextjs";

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

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <ClerkLoading>{loadingState}</ClerkLoading>
      <ClerkDegraded>{unavailableState}</ClerkDegraded>
      <ClerkFailed>{unavailableState}</ClerkFailed>
      <ClerkLoaded>
        <SignIn
          routing="path"
          path="/sign-in"
          fallback={loadingState}
          fallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
        />
      </ClerkLoaded>
    </main>
  );
}

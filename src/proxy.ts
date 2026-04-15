import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const isProtectedDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);
const isPublicRoute = createRouteMatcher([
  "/",
  "/c(.*)",
  "/install-app(.*)",
  "/q(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/signin(.*)",
  "/nfc(.*)",
  "/api/chat(.*)",
  "/api/sticker(.*)",
  "/api/__clerk(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // When Clerk is not configured, skip all auth checks
  if (!clerkEnabled) {
    return;
  }

  if (isPublicRoute(req)) {
    return;
  }

  if (isProtectedDashboardRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

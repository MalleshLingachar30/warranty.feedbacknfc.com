import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);
const isPublicRoute = createRouteMatcher([
  "/",
  "/install-app(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/nfc(.*)",
  "/api/sticker(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
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

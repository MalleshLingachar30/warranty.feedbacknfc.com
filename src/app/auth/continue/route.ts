import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { resolveAppRoleForSession } from "@/lib/app-user";
import { getDefaultDashboardPath } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const { role } = await resolveAppRoleForSession({
    clerkUserId: userId,
    sessionClaims,
  });

  return NextResponse.redirect(
    new URL(getDefaultDashboardPath(role), request.url),
  );
}

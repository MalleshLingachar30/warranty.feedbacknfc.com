import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

export const getCachedAuth = cache(async () => auth());

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

type AuthResult = Awaited<ReturnType<typeof auth>>;

const EMPTY_AUTH = {
  userId: null,
  sessionClaims: null,
  orgRole: null,
} as Pick<AuthResult, "userId" | "sessionClaims" | "orgRole">;

export const getOptionalAuth = cache(async () => {
  if (!clerkConfigured) {
    return EMPTY_AUTH;
  }

  try {
    const authResult = await auth();
    return {
      userId: authResult.userId,
      sessionClaims: authResult.sessionClaims,
      orgRole: authResult.orgRole,
    };
  } catch {
    return EMPTY_AUTH;
  }
});

export const getCachedCurrentUser = cache(async () =>
  currentUser().catch(() => null),
);

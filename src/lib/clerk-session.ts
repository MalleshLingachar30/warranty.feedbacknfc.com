import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

export const getCachedAuth = cache(async () => auth());

export const getCachedCurrentUser = cache(async () =>
  currentUser().catch(() => null),
);

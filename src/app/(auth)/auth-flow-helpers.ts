import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

type ClerkTaskKey = "choose-organization" | "reset-password" | "setup-mfa";

const taskRouteByKey: Record<ClerkTaskKey, string> = {
  "choose-organization": "choose-organization",
  "reset-password": "reset-password",
  "setup-mfa": "setup-mfa",
};

export const continuationAppearance = {
  elements: {
    socialButtonsBlockButton: "hidden",
    socialButtonsBlock: "hidden",
    dividerRow: "hidden",
  },
} as const;

export function getRedirectTarget(searchParams: {
  get: (key: string) => string | null;
}): string {
  return (
    searchParams.get("redirect_url") ??
    searchParams.get("redirectUrl") ??
    "/dashboard"
  );
}

export function getErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (isClerkAPIResponseError(error)) {
    return (
      error.errors[0]?.longMessage ??
      error.errors[0]?.message ??
      fallbackMessage
    );
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export function getTaskPath(
  basePath: "/sign-in" | "/sign-up",
  taskKey: string,
): string | null {
  if (!(taskKey in taskRouteByKey)) {
    return null;
  }

  return `${basePath}/tasks/${taskRouteByKey[taskKey as ClerkTaskKey]}`;
}

export function withSearchParams(
  path: string,
  searchParams: { toString: () => string },
): string {
  const query = searchParams.toString();

  if (!query) {
    return path;
  }

  return `${path}?${query}`;
}

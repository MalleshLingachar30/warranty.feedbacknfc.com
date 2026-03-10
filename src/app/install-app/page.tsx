import { InstallAppClient } from "@/components/pwa/install-app-client";
import { getCachedAuth } from "@/lib/clerk-session";
import { resolveAppRoleForSession } from "@/lib/app-user";
import { parseAppRole, type AppRole } from "@/lib/roles";

function readNextPath(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return "/dashboard";
  }

  return value.startsWith("/dashboard") ? value : "/dashboard";
}

function readInviteRole(value: string | string[] | undefined): AppRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const role = parseAppRole(value);
  return role === "technician" || role === "service_center_admin"
    ? role
    : null;
}

export default async function InstallAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextPath = readNextPath(resolvedSearchParams.next);
  const inviteRole = readInviteRole(resolvedSearchParams.role);

  const { userId, sessionClaims } = await getCachedAuth();
  let currentRole: AppRole | null = null;

  if (userId) {
    const resolved = await resolveAppRoleForSession({
      clerkUserId: userId,
      sessionClaims,
    });
    currentRole = resolved.role;
  }

  return (
    <InstallAppClient
      currentRole={currentRole}
      inviteRole={inviteRole}
      nextPath={nextPath}
    />
  );
}

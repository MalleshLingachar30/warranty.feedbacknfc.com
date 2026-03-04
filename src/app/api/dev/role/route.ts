import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { APP_ROLES, parseAppRole, parseAppRoleFromClaims } from "@/lib/roles";

interface SetRoleRequest {
  role?: string;
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "This route is only available in development." },
      { status: 403 },
    );
  }

  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    userId,
    currentRole: parseAppRoleFromClaims(sessionClaims),
    allowedRoles: APP_ROLES,
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "This route is only available in development." },
      { status: 403 },
    );
  }

  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SetRoleRequest;
  const role = parseAppRole(body.role);

  const client = await clerkClient();

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      role,
    },
    unsafeMetadata: {
      role,
    },
  });

  return NextResponse.json({ success: true, role });
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ensureClerkUserBypassesClientTrust } from "@/lib/clerk-admin";

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureClerkUserBypassesClientTrust(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to enable Clerk client trust bypass", error);
    return NextResponse.json(
      { error: "Failed to update Clerk user security settings." },
      { status: 500 },
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";

import { ensureClerkUserBypassesClientTrust } from "@/lib/clerk-admin";

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(async () => {
    try {
      await ensureClerkUserBypassesClientTrust(userId);
    } catch (error) {
      console.error("Failed to enable Clerk client trust bypass", error);
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}

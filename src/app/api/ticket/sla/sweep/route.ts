import { NextResponse } from "next/server";

import { runSlaSweep } from "@/lib/sla-engine";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredKey = process.env.SLA_CRON_KEY;

  if (!configuredKey) {
    return process.env.NODE_ENV !== "production";
  }

  const providedKey = request.headers.get("x-sla-cron-key");
  return providedKey === configuredKey;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: "Unauthorized SLA sweep request." },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const ticketId = url.searchParams.get("ticketId") ?? undefined;
    const result = await runSlaSweep({ ticketId });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("SLA sweep failed", error);
    return NextResponse.json(
      { error: "Unable to process SLA sweep." },
      { status: 500 },
    );
  }
}

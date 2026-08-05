import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runPreventiveMaintenanceScheduledDispatcher } from "@/lib/preventive-maintenance-scheduled-dispatcher";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecrets = [
    process.env.PM_NOTIFICATION_SCHEDULER_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((secret): secret is string => Boolean(secret));

  if (configuredSecrets.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return false;
  }

  return configuredSecrets.some((secret) => {
    const expected = `Bearer ${secret}`;
    return (
      authorization.length === expected.length &&
      timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
    );
  });
}

async function handleScheduledDispatch(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized PM scheduled dispatcher request." },
      { status: 401 },
    );
  }

  try {
    const result = await runPreventiveMaintenanceScheduledDispatcher();
    return NextResponse.json(result, {
      status: result.disposition === "failed" ? 500 : 200,
    });
  } catch (error) {
    console.error(
      "PM scheduled dispatcher failed before run completion",
      error,
    );
    return NextResponse.json(
      { error: "Unable to complete the PM scheduled dispatcher run." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleScheduledDispatch(request);
}

export async function POST(request: Request) {
  return handleScheduledDispatch(request);
}

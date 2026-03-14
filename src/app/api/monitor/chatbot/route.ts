import { NextResponse } from "next/server";

import { runChatbotMonitor } from "@/lib/chatbot-monitor";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  if (request.headers.get("x-vercel-cron") === "1") {
    return true;
  }

  const configuredKey = process.env.CHATBOT_MONITOR_CRON_KEY;

  if (!configuredKey) {
    return process.env.NODE_ENV !== "production";
  }

  const providedKey = request.headers.get("x-chatbot-monitor-key");
  return providedKey === configuredKey;
}

async function handleMonitor(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: "Unauthorized chatbot monitor request." },
        { status: 401 },
      );
    }

    const result = await runChatbotMonitor(new URL(request.url).origin);

    return NextResponse.json(result, {
      status: result.success ? 200 : 503,
    });
  } catch (error) {
    console.error("Chatbot monitor failed", error);
    return NextResponse.json(
      { error: "Unable to complete chatbot monitor run." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleMonitor(request);
}

export async function POST(request: Request) {
  return handleMonitor(request);
}

import "server-only";

import { db } from "@/lib/db";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";
import { sendChatbotMonitorAlert } from "@/lib/warranty-notifications";

const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;

type CheckName = "chat_reply" | "chat_lead";

type MonitorCheckResult = {
  name: CheckName;
  ok: boolean;
  status: number;
  detail: string;
};

type MonitorEvent =
  | {
      type: "degraded";
      checkName: CheckName;
      detail: string;
      failures: number;
      status: number;
    }
  | {
      type: "recovered";
      checkName: CheckName;
      detail: string;
      status: number;
    };

function nowIso(): string {
  return new Date().toISOString();
}

function buildMonitorUrl(path: string, baseUrl?: string): string {
  if (!baseUrl) {
    return buildAbsoluteWarrantyUrl(path);
  }

  return new URL(path, baseUrl).toString();
}

async function fetchJson(path: string, init: RequestInit, baseUrl?: string) {
  const response = await fetch(buildMonitorUrl(path, baseUrl), {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();

  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = raw;
    }
  }

  return { response, json };
}

async function runChatReplyCheck(baseUrl?: string): Promise<MonitorCheckResult> {
  try {
    const { response, json } = await fetchJson(
      "/api/chat",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-chat-monitor-probe": "1",
        },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "How does the QR warranty system work?",
          },
        ],
      }),
      },
      baseUrl,
    );

    if (response.ok && typeof (json as { reply?: unknown })?.reply === "string") {
      const reply = (json as { reply: string }).reply.trim();
      return {
        name: "chat_reply",
        ok: reply.length > 0,
        status: response.status,
        detail:
          reply.length > 0
            ? "Chat reply returned successfully."
            : "Chat reply was empty.",
      };
    }

    return {
      name: "chat_reply",
      ok: false,
      status: response.status,
      detail: `Unexpected chat reply response: ${JSON.stringify(json)}`,
    };
  } catch (error) {
    return {
      name: "chat_reply",
      ok: false,
      status: 0,
      detail:
        error instanceof Error ? error.message : "Unknown chat reply error",
    };
  }
}

async function runChatLeadCheck(baseUrl?: string): Promise<MonitorCheckResult> {
  const marker = `monitor-${Date.now()}`;

  try {
    const { response, json } = await fetchJson(
      "/api/chat/lead",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Chatbot Monitor",
          email: `${marker}@example.com`,
          phone: "+919876543210",
          company: "FeedbackNFC Monitoring",
          country: "India",
          language: "English",
          userType: "Manufacturer",
        }),
      },
      baseUrl,
    );

    const sessionId =
      typeof (json as { sessionId?: unknown })?.sessionId === "string"
        ? (json as { sessionId: string }).sessionId
        : null;

    if (response.ok && (json as { success?: unknown })?.success === true && sessionId) {
      await db.chatLead
        .delete({
          where: { sessionId },
        })
        .catch(() => null);

      return {
        name: "chat_lead",
        ok: true,
        status: response.status,
        detail: "Lead capture returned success.",
      };
    }

    return {
      name: "chat_lead",
      ok: false,
      status: response.status,
      detail: `Unexpected lead response: ${JSON.stringify(json)}`,
    };
  } catch (error) {
    return {
      name: "chat_lead",
      ok: false,
      status: 0,
      detail:
        error instanceof Error ? error.message : "Unknown lead capture error",
    };
  }
}

function shouldSendDegradedAlert(lastAlertedAt: Date | null): boolean {
  if (!lastAlertedAt) {
    return true;
  }

  return Date.now() - lastAlertedAt.getTime() >= ALERT_COOLDOWN_MS;
}

function formatEventsForAlert(events: MonitorEvent[], baseUrl?: string) {
  const degraded = events.filter(
    (event): event is Extract<MonitorEvent, { type: "degraded" }> =>
      event.type === "degraded",
  );
  const recovered = events.filter(
    (event): event is Extract<MonitorEvent, { type: "recovered" }> =>
      event.type === "recovered",
  );

  let subject = "Chatbot monitor healthy";
  if (degraded.length > 0) {
    subject = `Chatbot alert: ${degraded
      .map((event) => event.checkName)
      .join(", ")}`;
  } else if (recovered.length > 0) {
    subject = `Chatbot recovered: ${recovered
      .map((event) => event.checkName)
      .join(", ")}`;
  }

  const sections: string[] = [
    `Timestamp: ${nowIso()}`,
    `App: ${baseUrl ?? buildAbsoluteWarrantyUrl("/")}`,
  ];

  if (degraded.length > 0) {
    sections.push(
      `Failures:\n${degraded
        .map(
          (event) =>
            `- ${event.checkName}: status=${event.status} failures=${event.failures} detail=${event.detail}`,
        )
        .join("\n")}`,
    );
  }

  if (recovered.length > 0) {
    sections.push(
      `Recovered:\n${recovered
        .map(
          (event) =>
            `- ${event.checkName}: status=${event.status} detail=${event.detail}`,
        )
        .join("\n")}`,
    );
  }

  return {
    subject,
    body: sections.join("\n\n"),
  };
}

async function updateStateForResult(result: MonitorCheckResult) {
  const current = await db.endpointMonitorState.findUnique({
    where: { checkName: result.name },
  });
  const checkedAt = new Date();

  if (result.ok) {
    const updated = await db.endpointMonitorState.upsert({
      where: { checkName: result.name },
      create: {
        checkName: result.name,
        status: "healthy",
        consecutiveFailures: 0,
        lastCheckedAt: checkedAt,
        lastSuccessAt: checkedAt,
        lastResolvedAt: current?.status === "degraded" ? checkedAt : null,
        lastError: null,
      },
      update: {
        status: "healthy",
        consecutiveFailures: 0,
        lastCheckedAt: checkedAt,
        lastSuccessAt: checkedAt,
        lastResolvedAt: current?.status === "degraded" ? checkedAt : current?.lastResolvedAt ?? null,
        lastError: null,
      },
    });

    if (current?.status === "degraded") {
      return {
        updated,
        event: {
          type: "recovered" as const,
          checkName: result.name,
          detail: result.detail,
          status: result.status,
        },
      };
    }

    return { updated, event: null };
  }

  const failures = (current?.consecutiveFailures ?? 0) + 1;
  const sendAlert =
    current?.status !== "degraded" ||
    shouldSendDegradedAlert(current?.lastAlertedAt ?? null);

  const updated = await db.endpointMonitorState.upsert({
    where: { checkName: result.name },
    create: {
      checkName: result.name,
      status: "degraded",
      consecutiveFailures: failures,
      lastCheckedAt: checkedAt,
      lastFailureAt: checkedAt,
      lastAlertedAt: sendAlert ? checkedAt : null,
      lastError: result.detail,
    },
    update: {
      status: "degraded",
      consecutiveFailures: failures,
      lastCheckedAt: checkedAt,
      lastFailureAt: checkedAt,
      lastAlertedAt: sendAlert ? checkedAt : current?.lastAlertedAt ?? null,
      lastError: result.detail,
    },
  });

  return {
    updated,
    event: sendAlert
      ? {
          type: "degraded" as const,
          checkName: result.name,
          detail: result.detail,
          failures,
          status: result.status,
        }
      : null,
  };
}

export async function runChatbotMonitor(baseUrl?: string) {
  const results = await Promise.all([
    runChatReplyCheck(baseUrl),
    runChatLeadCheck(baseUrl),
  ]);
  const events: MonitorEvent[] = [];

  for (const result of results) {
    const stateUpdate = await updateStateForResult(result);
    if (stateUpdate.event) {
      events.push(stateUpdate.event);
    }
  }

  if (events.length > 0) {
    const alert = formatEventsForAlert(events, baseUrl);
    await sendChatbotMonitorAlert(alert);
  }

  return {
    success: results.every((result) => result.ok),
    checkedAt: nowIso(),
    results,
    events,
  };
}

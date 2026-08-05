import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PmNotificationCenter } from "@/components/notifications/pm-notification-center";

const notificationResponse = {
  notifications: [],
  pendingCount: 3,
  filteredCount: 0,
  statusCounts: {
    pending: 3,
    delivered: 0,
    dismissed: 0,
    cancelled: 0,
  },
  lastDryRun: null,
  deliveryReadiness: null,
  schedulerStatus: null,
};

const dryRunResponse = {
  dryRun: true,
  preparedAt: "2026-08-05T12:00:00.000Z",
  scannedIntentCount: 3,
  candidateAttemptCount: 6,
  createdAttemptCount: 2,
  existingAttemptCount: 4,
  missingRecipientCount: 0,
  queuedAttemptCount: 0,
  skippedAttemptCount: 6,
  preferenceSuppressedCount: 0,
  suppressionReasonCounts: { dry_run: 6 },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PmNotificationCenter dry-run interaction", () => {
  it("posts from the rendered button, shows progress, and refreshes the inbox", async () => {
    let resolveDispatch!: (response: Response) => void;
    const dispatchResponse = new Promise<Response>((resolve) => {
      resolveDispatch = resolve;
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (
          url === "/api/preventive-maintenance/notifications/dispatch" &&
          init?.method === "POST"
        ) {
          return dispatchResponse;
        }

        if (url.startsWith("/api/preventive-maintenance/notifications?")) {
          return Response.json(notificationResponse);
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PmNotificationCenter role="manufacturer_admin" />);

    const button = await screen.findByRole("button", {
      name: "Run dry run",
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith(
            "/api/preventive-maintenance/notifications?",
          ),
        ),
      ).toHaveLength(1);
    });

    await userEvent.click(button);

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toContain("Running dry run");
    expect(screen.getByRole("status").textContent).toContain(
      "Preparing non-live email and SMS attempts",
    );

    const dispatchCall = fetchMock.mock.calls.find(
      ([input]) =>
        String(input) === "/api/preventive-maintenance/notifications/dispatch",
    );
    expect(dispatchCall).toBeDefined();
    expect(dispatchCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(dispatchCall?.[1]?.body))).toEqual({
      dryRun: true,
      channels: ["email", "sms"],
      limit: 50,
    });

    resolveDispatch(Response.json(dryRunResponse));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "Scanned 3 pending notifications and prepared 6 channel attempts",
      );
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.textContent).toContain("Run dry run");
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith("/api/preventive-maintenance/notifications?"),
      ),
    ).toHaveLength(2);
  });

  it("shows an accessible error when the rendered button request fails", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (
          url === "/api/preventive-maintenance/notifications/dispatch" &&
          init?.method === "POST"
        ) {
          return Response.json(
            { error: "Dry run is temporarily unavailable." },
            { status: 503 },
          );
        }

        if (url.startsWith("/api/preventive-maintenance/notifications?")) {
          return Response.json(notificationResponse);
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PmNotificationCenter role="manufacturer_admin" />);

    const button = await screen.findByRole("button", {
      name: "Run dry run",
    });
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "Dry run is temporarily unavailable.",
      );
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) ===
            "/api/preventive-maintenance/notifications/dispatch" &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });
});

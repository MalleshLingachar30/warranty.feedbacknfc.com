import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PmNotificationCenter } from "@/components/notifications/pm-notification-center";
import { PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION } from "@/lib/preventive-maintenance-manual-email-pilot-policy";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

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

const pilotNotificationId = "00000000-0000-4000-8000-000000000001";
const pilotNotificationResponse = {
  ...notificationResponse,
  notifications: [
    {
      id: pilotNotificationId,
      triggerType: "scheduled",
      recipientRole: "customer",
      status: "pending",
      title: "Preventive maintenance due",
      message: "Book the reviewed preventive maintenance visit.",
      createdAt: "2026-08-10T09:00:00.000Z",
      deliveryAttempts: [
        {
          id: "dry-run-attempt-1",
          channel: "email",
          status: "skipped",
          dryRun: true,
          recipientAddressMasked: "r***@e***.com",
          hasRecipientAddress: true,
          providerMessageId: null,
          errorMessage: null,
          skipReason: "dry_run",
          attemptNumber: 1,
          nextRetryAt: null,
          deadLetteredAt: null,
          createdAt: "2026-08-10T09:05:00.000Z",
          updatedAt: "2026-08-10T09:05:00.000Z",
        },
      ],
      event: {
        eventNumber: "PM-000001",
        eventType: "preventive_maintenance",
        status: "scheduled",
        dueDate: "2026-08-12T00:00:00.000Z",
        scheduledFor: "2026-08-12T05:00:00.000Z",
        completedAt: null,
        asset: {
          publicCode: "ASSET-1",
          serialNumber: "SERIAL-1",
          productModel: {
            name: "Cooling unit",
            modelNumber: "CU-1",
          },
        },
        assignedServiceCenter: null,
        assignedTechnician: null,
      },
    },
  ],
  filteredCount: 1,
  deliveryReadiness: {
    provider: "resend",
    liveEmail: {
      status: "ready",
      enabled: true,
      apiKeyConfigured: true,
      fromEmailConfigured: true,
      missingConfiguration: [],
    },
    canary: {
      status: "disabled",
      enabled: false,
      recipientConfigured: false,
      recipientAddressMasked: null,
      missingConfiguration: [],
    },
    sms: { status: "unsupported" },
    preferences: null,
  },
};

const pilotSuccessResponse = {
  ok: true,
  mode: "manual_live_email_pilot",
  auditId: "audit-pilot-1",
  completedAt: "2026-08-10T09:10:00.000Z",
  selectedNotificationCount: 1,
  scannedIntentCount: 1,
  candidateAttemptCount: 1,
  createdAttemptCount: 1,
  existingAttemptCount: 0,
  sentAttemptCount: 1,
  failedAttemptCount: 0,
  skippedAttemptCount: 0,
  missingRecipientCount: 0,
  preferenceSuppressedCount: 0,
  providerCallCount: 1,
  suppressionReasonCounts: {},
  attempts: [
    {
      id: "live-attempt-1",
      notificationIntentId: pilotNotificationId,
      channel: "email",
      status: "sent",
      recipientAddressMasked: "r***@e***.com",
      hasRecipientAddress: true,
      errorMessage: null,
      skipReason: null,
      attemptNumber: 1,
      updatedAt: "2026-08-10T09:10:00.000Z",
    },
  ],
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
    const filterPanel = screen.getByTestId("pm-notification-filter-panel");
    const dryRunPanel = screen.getByTestId("pm-delivery-dry-run-panel");

    // Keep the production-facing action directly after the compact filters.
    // Long readiness, scheduler, and preferences diagnostics follow this panel,
    // so moving it below them can put the clickable target outside the viewport.
    expect(filterPanel.nextElementSibling).toBe(dryRunPanel);
    expect(button.closest("[data-testid='pm-delivery-dry-run-panel']")).toBe(
      dryRunPanel,
    );
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]: FetchCall) =>
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
      ([input]: FetchCall) =>
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
      fetchMock.mock.calls.filter(([input]: FetchCall) =>
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
        ([input, init]: FetchCall) =>
          String(input) ===
            "/api/preventive-maintenance/notifications/dispatch" &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("requires reviewed selection and explicit confirmation before a successful manual live email pilot", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (
          url ===
            "/api/preventive-maintenance/notifications/manual-email-pilot" &&
          init?.method === "POST"
        ) {
          return Response.json(pilotSuccessResponse);
        }

        if (url.startsWith("/api/preventive-maintenance/notifications?")) {
          return Response.json(pilotNotificationResponse);
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PmNotificationCenter role="manufacturer_admin" />);

    const selectPilot = await screen.findByRole("checkbox", {
      name: "Select Preventive maintenance due for manual live email pilot",
    });
    const confirmation = screen.getByRole("checkbox", {
      name: /I reviewed these selected notifications/i,
    });
    const sendButton = screen.getByRole("button", {
      name: "Send selected live emails",
    });

    expect((confirmation as HTMLInputElement).disabled).toBe(true);
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(selectPilot);

    expect((confirmation as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText("1/5", { selector: "p" }).textContent).toBe("1/5");
    expect(
      (
        screen.getByRole("button", {
          name: "Send 1 live email",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await userEvent.click(confirmation);
    const confirmedSendButton = screen.getByRole("button", {
      name: "Send 1 live email",
    });
    expect((confirmedSendButton as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(confirmedSendButton);

    await waitFor(() => {
      expect(
        screen.getByText("Manual pilot recorded").closest("[role='status']")
          ?.textContent,
      ).toContain("1 sent · 0 skipped · 0 failed · 1 provider calls");
    });

    const pilotCall = fetchMock.mock.calls.find(
      ([input]: FetchCall) =>
        String(input) ===
        "/api/preventive-maintenance/notifications/manual-email-pilot",
    );
    expect(pilotCall).toBeDefined();
    expect(JSON.parse(String(pilotCall?.[1]?.body))).toEqual({
      notificationIds: [pilotNotificationId],
      confirmation: PREVENTIVE_MAINTENANCE_MANUAL_EMAIL_PILOT_CONFIRMATION,
    });
    expect(JSON.stringify(pilotSuccessResponse)).not.toContain(
      "recipient@example.com",
    );
    expect(JSON.stringify(pilotSuccessResponse)).not.toContain(
      "providerResponse",
    );
  });
});

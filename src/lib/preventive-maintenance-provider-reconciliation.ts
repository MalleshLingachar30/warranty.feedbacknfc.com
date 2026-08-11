import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { maskPreventiveMaintenanceDeliveryRecipientAddress } from "@/lib/preventive-maintenance-delivery-attempts";
import {
  finishPreventiveMaintenanceNotificationAuditSafely,
  preventiveMaintenanceAuditErrorMessage,
  startPreventiveMaintenanceNotificationAudit,
  startPreventiveMaintenanceNotificationSystemAudit,
} from "@/lib/preventive-maintenance-notification-audit";
import type { PreventiveMaintenanceNotificationAudience } from "@/lib/preventive-maintenance-notifications";
import {
  emptyProviderEventStatusCounts,
  hygieneStatusForProviderEvent,
  recipientHygieneBlockReason,
  shouldApplyPreventiveMaintenanceProviderEvent,
  type PreventiveMaintenanceProviderReconciliationEvent,
  type PreventiveMaintenanceRecipientHygieneStatus,
} from "@/lib/preventive-maintenance-provider-reconciliation-policy";
import { hashPreventiveMaintenanceRecipientAddress } from "@/lib/preventive-maintenance-recipient-hygiene";

type RecipientHygieneLookupInput = {
  organizationId: string;
  channel: "email" | "sms";
  recipientAddress: string | null;
};

function recipientHygieneLookupKey(input: {
  organizationId: string;
  channel: "email" | "sms";
  recipientAddressHash: string;
}) {
  return `${input.organizationId}:${input.channel}:${input.recipientAddressHash}`;
}

export function buildPreventiveMaintenanceProviderReconciliationScopeWhere(
  audience: PreventiveMaintenanceNotificationAudience,
): Prisma.PreventiveMaintenanceNotificationDeliveryAttemptWhereInput {
  if (audience.role === "platform_owner") {
    return {};
  }

  return {
    OR: [
      ...(audience.organizationId
        ? [{ organizationId: audience.organizationId }]
        : []),
      { notificationIntent: { is: audience.where } },
    ],
  };
}

export async function getBlockedPreventiveMaintenanceRecipients(
  inputs: RecipientHygieneLookupInput[],
) {
  const lookups = [
    ...new Map(
      inputs.flatMap((input) => {
        if (!input.recipientAddress) {
          return [];
        }

        const recipientAddressHash = hashPreventiveMaintenanceRecipientAddress(
          input.recipientAddress,
          input.channel,
        );
        const lookup = {
          organizationId: input.organizationId,
          channel: input.channel,
          recipientAddressHash,
        };
        return [[recipientHygieneLookupKey(lookup), lookup] as const];
      }),
    ).values(),
  ];

  if (lookups.length === 0) {
    return new Map<string, PreventiveMaintenanceRecipientHygieneStatus>();
  }

  const records =
    await db.preventiveMaintenanceNotificationRecipientHygiene.findMany({
      where: { OR: lookups },
      select: {
        organizationId: true,
        channel: true,
        recipientAddressHash: true,
        status: true,
      },
    });

  return new Map(
    records.map((record) => [
      recipientHygieneLookupKey(record),
      record.status as PreventiveMaintenanceRecipientHygieneStatus,
    ]),
  );
}

export function resolvePreventiveMaintenanceRecipientHygieneBlock(input: {
  organizationId: string;
  channel: "email" | "sms";
  recipientAddress: string | null;
  blockedRecipients: ReadonlyMap<
    string,
    PreventiveMaintenanceRecipientHygieneStatus
  >;
}) {
  if (!input.recipientAddress) {
    return null;
  }

  const status = input.blockedRecipients.get(
    recipientHygieneLookupKey({
      organizationId: input.organizationId,
      channel: input.channel,
      recipientAddressHash: hashPreventiveMaintenanceRecipientAddress(
        input.recipientAddress,
        input.channel,
      ),
    }),
  );

  return status ? recipientHygieneBlockReason(status) : null;
}

export async function reconcilePreventiveMaintenanceProviderEvents(input: {
  audience: PreventiveMaintenanceNotificationAudience;
  events: PreventiveMaintenanceProviderReconciliationEvent[];
}) {
  const audit = await startPreventiveMaintenanceNotificationAudit({
    audience: input.audience,
    operation: "provider_reconciliation",
    channel: "email",
    metadata: {
      provider: "resend",
      submittedEventCount: input.events.length,
    },
  });

  return reconcilePreventiveMaintenanceProviderEventsWithAudit({
    events: input.events,
    scopeWhere: buildPreventiveMaintenanceProviderReconciliationScopeWhere(
      input.audience,
    ),
    auditId: audit.id,
    reconciliationSource: "operator",
  });
}

export async function startPreventiveMaintenanceResendWebhookAudit() {
  return startPreventiveMaintenanceNotificationSystemAudit({
    actorRole: "system_webhook",
    operation: "provider_reconciliation",
    channel: "email",
    metadata: {
      provider: "resend",
      reconciliationSource: "resend_webhook",
      webhookOutcome: "received",
      submittedEventCount: 0,
    },
  });
}

export async function rejectPreventiveMaintenanceResendWebhookAudit(input: {
  auditId: string;
  rejectionReason: string;
}) {
  await finishPreventiveMaintenanceNotificationAuditSafely({
    auditId: input.auditId,
    outcome: "rejected",
    deliveryAttemptCount: 0,
    providerCallCount: 0,
    metadata: {
      provider: "resend",
      reconciliationSource: "resend_webhook",
      webhookOutcome: "rejected",
      rejectionReason: input.rejectionReason,
      submittedEventCount: 0,
      matchedAttemptCount: 0,
      updatedAttemptCount: 0,
      staleEventCount: 0,
      notFoundCount: 0,
      ambiguousMatchCount: 0,
      hygieneSignalCount: 0,
      sourceEventTypes: [],
      providerEventCounts: emptyProviderEventStatusCounts(),
    },
  });
}

export async function reconcilePreventiveMaintenanceResendWebhookEvent(input: {
  auditId: string;
  event: PreventiveMaintenanceProviderReconciliationEvent;
}) {
  return reconcilePreventiveMaintenanceProviderEventsWithAudit({
    events: [input.event],
    scopeWhere: {},
    auditId: input.auditId,
    reconciliationSource: "resend_webhook",
  });
}

async function reconcilePreventiveMaintenanceProviderEventsWithAudit(input: {
  events: PreventiveMaintenanceProviderReconciliationEvent[];
  scopeWhere: Prisma.PreventiveMaintenanceNotificationDeliveryAttemptWhereInput;
  auditId: string;
  reconciliationSource: "operator" | "resend_webhook";
}) {
  const auditId = input.auditId;

  const providerEventCounts = emptyProviderEventStatusCounts();
  const matchedOrganizationIds = new Set<string>();
  const sourceEventTypes = [
    ...new Set(
      input.events.flatMap((event) =>
        event.sourceEventType ? [event.sourceEventType] : [],
      ),
    ),
  ];
  const results: Array<{
    providerMessageId: string;
    disposition: "updated" | "stale" | "not_found" | "ambiguous";
    providerEventStatus: string;
    providerEventAt: string;
    hygieneBlocked: boolean;
  }> = [];
  let updatedAttemptCount = 0;
  let staleEventCount = 0;
  let notFoundCount = 0;
  let ambiguousMatchCount = 0;
  let hygieneSignalCount = 0;

  try {
    const attempts =
      await db.preventiveMaintenanceNotificationDeliveryAttempt.findMany({
        where: {
          providerMessageId: {
            in: [
              ...new Set(input.events.map((event) => event.providerMessageId)),
            ],
          },
          dryRun: false,
          channel: "email",
          ...input.scopeWhere,
        },
        select: {
          id: true,
          organizationId: true,
          recipientAddress: true,
          providerMessageId: true,
          providerEventStatus: true,
          providerEventAt: true,
        },
      });
    const attemptsByProviderMessageId = new Map<
      string,
      (typeof attempts)[number][]
    >();
    for (const attempt of attempts) {
      if (attempt.providerMessageId) {
        const matchingAttempts =
          attemptsByProviderMessageId.get(attempt.providerMessageId) ?? [];
        matchingAttempts.push(attempt);
        attemptsByProviderMessageId.set(
          attempt.providerMessageId,
          matchingAttempts,
        );
      }
    }

    for (const event of input.events) {
      providerEventCounts[event.status] += 1;
      const matchingAttempts = attemptsByProviderMessageId.get(
        event.providerMessageId,
      );
      const attempt = matchingAttempts?.[0];

      if (!attempt) {
        notFoundCount += 1;
        results.push({
          providerMessageId: event.providerMessageId,
          disposition: "not_found",
          providerEventStatus: event.status,
          providerEventAt: event.occurredAt.toISOString(),
          hygieneBlocked: false,
        });
        continue;
      }

      if (matchingAttempts.length > 1) {
        ambiguousMatchCount += 1;
        results.push({
          providerMessageId: event.providerMessageId,
          disposition: "ambiguous",
          providerEventStatus: event.status,
          providerEventAt: event.occurredAt.toISOString(),
          hygieneBlocked: false,
        });
        continue;
      }

      if (
        !shouldApplyPreventiveMaintenanceProviderEvent({
          currentStatus: attempt.providerEventStatus,
          currentOccurredAt: attempt.providerEventAt,
          nextStatus: event.status,
          nextOccurredAt: event.occurredAt,
        })
      ) {
        matchedOrganizationIds.add(attempt.organizationId);
        staleEventCount += 1;
        results.push({
          providerMessageId: event.providerMessageId,
          disposition: "stale",
          providerEventStatus: attempt.providerEventStatus ?? event.status,
          providerEventAt: (
            attempt.providerEventAt ?? event.occurredAt
          ).toISOString(),
          hygieneBlocked: Boolean(
            attempt.providerEventStatus &&
            hygieneStatusForProviderEvent(attempt.providerEventStatus),
          ),
        });
        continue;
      }

      const reconciledAt = new Date();
      matchedOrganizationIds.add(attempt.organizationId);
      const hygieneStatus = hygieneStatusForProviderEvent(event.status);
      const operations: Prisma.PrismaPromise<unknown>[] = [
        db.preventiveMaintenanceNotificationDeliveryAttempt.update({
          where: { id: attempt.id },
          data: {
            providerEventStatus: event.status,
            providerEventAt: event.occurredAt,
            providerReconciledAt: reconciledAt,
          },
        }),
      ];

      const recipientAddressMasked = attempt.recipientAddress
        ? maskPreventiveMaintenanceDeliveryRecipientAddress(
            attempt.recipientAddress,
            "email",
          )
        : null;
      let hygieneRecorded = false;
      if (hygieneStatus && attempt.recipientAddress && recipientAddressMasked) {
        const recipientAddressHash = hashPreventiveMaintenanceRecipientAddress(
          attempt.recipientAddress,
          "email",
        );
        operations.push(
          db.preventiveMaintenanceNotificationRecipientHygiene.upsert({
            where: {
              organizationId_channel_recipientAddressHash: {
                organizationId: attempt.organizationId,
                channel: "email",
                recipientAddressHash,
              },
            },
            create: {
              organizationId: attempt.organizationId,
              channel: "email",
              recipientAddressHash,
              recipientAddressMasked,
              status: hygieneStatus,
              sourceAttemptId: attempt.id,
              firstSeenAt: event.occurredAt,
              lastSeenAt: event.occurredAt,
            },
            update: {
              recipientAddressMasked,
              status: hygieneStatus,
              sourceAttemptId: attempt.id,
              lastSeenAt: event.occurredAt,
            },
          }),
        );
        hygieneRecorded = true;
      }

      await db.$transaction(operations);
      attempt.providerEventStatus = event.status;
      attempt.providerEventAt = event.occurredAt;
      updatedAttemptCount += 1;
      hygieneSignalCount += hygieneRecorded ? 1 : 0;
      results.push({
        providerMessageId: event.providerMessageId,
        disposition: "updated",
        providerEventStatus: event.status,
        providerEventAt: event.occurredAt.toISOString(),
        hygieneBlocked: Boolean(hygieneStatus),
      });
    }

    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId,
      organizationId:
        input.reconciliationSource === "resend_webhook" &&
        matchedOrganizationIds.size === 1
          ? [...matchedOrganizationIds][0]
          : undefined,
      outcome:
        notFoundCount > 0 || ambiguousMatchCount > 0
          ? "completed_with_failures"
          : "succeeded",
      deliveryAttemptCount: updatedAttemptCount,
      providerCallCount: 0,
      metadata: {
        provider: "resend",
        reconciliationSource: input.reconciliationSource,
        ...(input.reconciliationSource === "resend_webhook"
          ? { webhookOutcome: "processed" }
          : {}),
        submittedEventCount: input.events.length,
        matchedAttemptCount: updatedAttemptCount + staleEventCount,
        updatedAttemptCount,
        staleEventCount,
        notFoundCount,
        ambiguousMatchCount,
        hygieneSignalCount,
        sourceEventTypes,
        providerEventCounts,
      },
    });

    return {
      ok: true as const,
      auditId,
      submittedEventCount: input.events.length,
      matchedAttemptCount: updatedAttemptCount + staleEventCount,
      updatedAttemptCount,
      staleEventCount,
      notFoundCount,
      ambiguousMatchCount,
      hygieneSignalCount,
      providerEventCounts,
      results,
    };
  } catch (error) {
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId,
      organizationId:
        input.reconciliationSource === "resend_webhook" &&
        matchedOrganizationIds.size === 1
          ? [...matchedOrganizationIds][0]
          : undefined,
      outcome: "failed",
      deliveryAttemptCount: updatedAttemptCount,
      providerCallCount: 0,
      errorMessage: preventiveMaintenanceAuditErrorMessage(error),
      metadata: {
        provider: "resend",
        reconciliationSource: input.reconciliationSource,
        ...(input.reconciliationSource === "resend_webhook"
          ? { webhookOutcome: "failed" }
          : {}),
        submittedEventCount: input.events.length,
        matchedAttemptCount: updatedAttemptCount + staleEventCount,
        updatedAttemptCount,
        staleEventCount,
        notFoundCount,
        ambiguousMatchCount,
        hygieneSignalCount,
        sourceEventTypes,
        providerEventCounts,
      },
    });
    throw error;
  }
}

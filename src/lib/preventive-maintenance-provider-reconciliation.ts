import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { maskPreventiveMaintenanceDeliveryRecipientAddress } from "@/lib/preventive-maintenance-delivery-attempts";
import {
  finishPreventiveMaintenanceNotificationAuditSafely,
  preventiveMaintenanceAuditErrorMessage,
  startPreventiveMaintenanceNotificationAudit,
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

  const providerEventCounts = emptyProviderEventStatusCounts();
  const results: Array<{
    providerMessageId: string;
    disposition: "updated" | "stale" | "not_found";
    providerEventStatus: string;
    providerEventAt: string;
    hygieneBlocked: boolean;
  }> = [];
  let updatedAttemptCount = 0;
  let staleEventCount = 0;
  let notFoundCount = 0;
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
          ...buildPreventiveMaintenanceProviderReconciliationScopeWhere(
            input.audience,
          ),
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
    const attemptsByProviderMessageId = new Map(
      attempts.flatMap((attempt) =>
        attempt.providerMessageId
          ? [[attempt.providerMessageId, attempt] as const]
          : [],
      ),
    );

    for (const event of input.events) {
      providerEventCounts[event.status] += 1;
      const attempt = attemptsByProviderMessageId.get(event.providerMessageId);

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

      if (
        !shouldApplyPreventiveMaintenanceProviderEvent({
          currentStatus: attempt.providerEventStatus,
          currentOccurredAt: attempt.providerEventAt,
          nextStatus: event.status,
          nextOccurredAt: event.occurredAt,
        })
      ) {
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
      auditId: audit.id,
      outcome: notFoundCount > 0 ? "completed_with_failures" : "succeeded",
      deliveryAttemptCount: updatedAttemptCount,
      providerCallCount: 0,
      metadata: {
        provider: "resend",
        submittedEventCount: input.events.length,
        updatedAttemptCount,
        staleEventCount,
        notFoundCount,
        hygieneSignalCount,
        providerEventCounts,
      },
    });

    return {
      ok: true as const,
      auditId: audit.id,
      submittedEventCount: input.events.length,
      updatedAttemptCount,
      staleEventCount,
      notFoundCount,
      hygieneSignalCount,
      providerEventCounts,
      results,
    };
  } catch (error) {
    await finishPreventiveMaintenanceNotificationAuditSafely({
      auditId: audit.id,
      outcome: "failed",
      deliveryAttemptCount: updatedAttemptCount,
      providerCallCount: 0,
      errorMessage: preventiveMaintenanceAuditErrorMessage(error),
      metadata: {
        provider: "resend",
        submittedEventCount: input.events.length,
        updatedAttemptCount,
        staleEventCount,
        notFoundCount,
        hygieneSignalCount,
      },
    });
    throw error;
  }
}

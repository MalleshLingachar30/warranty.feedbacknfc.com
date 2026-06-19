import {
  InternalServiceDisposition,
  PartUsageType,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import { resolveInternalServiceTrackedPartByReference } from "@/lib/internal-services";

export class InternalServiceOrderActionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "InternalServiceOrderActionError";
    this.statusCode = statusCode;
  }
}

export type InternalServiceAction =
  | "save_notes"
  | "add_part_usage"
  | "assign_engineer"
  | "mark_triaged"
  | "start_diagnosis"
  | "await_parts"
  | "start_repair"
  | "submit_to_qc"
  | "fail_qc"
  | "pass_qc"
  | "complete_disposition"
  | "close_order";

export type UpdateInternalServiceOrderRequest = {
  action?: unknown;
  assignedTechnicianId?: unknown;
  reportedFault?: unknown;
  diagnosisNotes?: unknown;
  resolutionNotes?: unknown;
  finalDisposition?: unknown;
  partUsageType?: unknown;
  partReference?: unknown;
  partName?: unknown;
  partNumber?: unknown;
  partNote?: unknown;
};

type NormalizedPartUsageInput = {
  usageType: PartUsageType;
  partReference: string | null;
  partName: string | null;
  partNumber: string | null;
  partNote: string | null;
};

type StatusTransition = {
  nextStatus: Prisma.InternalServiceOrderUpdateInput["status"];
  nextLifecycleState: Prisma.AssetIdentityUpdateInput["lifecycleState"];
  eventType: string;
  eventDescription: string;
  orderPatch?: Prisma.InternalServiceOrderUpdateInput;
};

export function asOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAction(value: unknown): InternalServiceAction {
  const action = asOptionalString(value);

  switch (action) {
    case "save_notes":
    case "add_part_usage":
    case "assign_engineer":
    case "mark_triaged":
    case "start_diagnosis":
    case "await_parts":
    case "start_repair":
    case "submit_to_qc":
    case "fail_qc":
    case "pass_qc":
    case "complete_disposition":
    case "close_order":
      return action;
    default:
      throw new InternalServiceOrderActionError("Unsupported internal-service action.", 400);
  }
}

function parsePartUsageType(value: unknown) {
  const usageType = asOptionalString(value);
  if (!usageType) {
    return null;
  }

  if (!(usageType in PartUsageType)) {
    throw new InternalServiceOrderActionError(
      "Unsupported internal-service part usage type.",
      400,
    );
  }

  return usageType as PartUsageType;
}

function normalizePartUsageInput(body: UpdateInternalServiceOrderRequest): NormalizedPartUsageInput | null {
  const usageType = parsePartUsageType(body.partUsageType);
  const partReference = asOptionalString(body.partReference);
  const partName = asOptionalString(body.partName);
  const partNumber = asOptionalString(body.partNumber);
  const partNote = asOptionalString(body.partNote);

  if (!usageType && !partReference && !partName && !partNumber && !partNote) {
    return null;
  }

  if (!usageType) {
    throw new InternalServiceOrderActionError(
      "Select a part usage type before adding internal repair part usage.",
      400,
    );
  }

  if (!partReference && !partName && !partNumber) {
    throw new InternalServiceOrderActionError(
      "Provide a tracked part reference or at least a part name / part number.",
      400,
    );
  }

  return {
    usageType,
    partReference,
    partName,
    partNumber,
    partNote,
  };
}

function parseDisposition(value: unknown) {
  const disposition = asOptionalString(value);
  if (!disposition) {
    return null;
  }

  if (!(disposition in InternalServiceDisposition)) {
    throw new InternalServiceOrderActionError(
      "Unsupported internal-service disposition.",
      400,
    );
  }

  return disposition as InternalServiceDisposition;
}

function buildTransition(
  action: InternalServiceAction,
  currentStatus: string,
  disposition: InternalServiceDisposition | null,
  now: Date,
): StatusTransition | null {
  switch (action) {
    case "save_notes":
    case "add_part_usage":
    case "assign_engineer":
      return null;
    case "mark_triaged":
      if (currentStatus !== "inward_received") {
        throw new InternalServiceOrderActionError(
          "Only inward-received orders can be marked as triaged.",
          409,
        );
      }
      return {
        nextStatus: "awaiting_triage",
        nextLifecycleState: "awaiting_triage",
        eventType: "awaiting_triage",
        eventDescription: "Internal-service order marked as ready for diagnosis triage.",
        orderPatch: {
          triagedAt: now,
        },
      };
    case "start_diagnosis":
      if (currentStatus !== "awaiting_triage" && currentStatus !== "qa_failed") {
        throw new InternalServiceOrderActionError(
          "Only triaged or QC-failed orders can enter diagnosis.",
          409,
        );
      }
      return {
        nextStatus: "under_diagnosis",
        nextLifecycleState: "under_diagnosis",
        eventType: "under_diagnosis",
        eventDescription:
          currentStatus === "qa_failed"
            ? "QC-failed order returned to diagnosis."
            : "Diagnosis started on the internal-service order.",
      };
    case "await_parts":
      if (currentStatus !== "under_diagnosis") {
        throw new InternalServiceOrderActionError(
          "Only orders under diagnosis can be marked as awaiting parts.",
          409,
        );
      }
      return {
        nextStatus: "awaiting_parts",
        nextLifecycleState: "awaiting_parts",
        eventType: "awaiting_parts",
        eventDescription: "Diagnosis concluded that additional parts are required.",
      };
    case "start_repair":
      if (currentStatus !== "under_diagnosis" && currentStatus !== "awaiting_parts") {
        throw new InternalServiceOrderActionError(
          "Only diagnosed or parts-waiting orders can start repair.",
          409,
        );
      }
      return {
        nextStatus: "repair_in_progress",
        nextLifecycleState: "under_repair",
        eventType: "repair_in_progress",
        eventDescription:
          currentStatus === "awaiting_parts"
            ? "Repair resumed after parts became available."
            : "Repair started on the internal-service order.",
        orderPatch: {
          repairStartedAt: now,
        },
      };
    case "submit_to_qc":
      if (currentStatus !== "repair_in_progress") {
        throw new InternalServiceOrderActionError(
          "Only orders under repair can be submitted to QC.",
          409,
        );
      }
      return {
        nextStatus: "awaiting_qc",
        nextLifecycleState: "awaiting_qc",
        eventType: "awaiting_qc",
        eventDescription: "Repair work completed and the order was submitted to QC.",
        orderPatch: {
          qcStartedAt: now,
        },
      };
    case "fail_qc":
      if (currentStatus !== "awaiting_qc") {
        throw new InternalServiceOrderActionError(
          "Only QC-pending orders can fail QC.",
          409,
        );
      }
      return {
        nextStatus: "qa_failed",
        nextLifecycleState: "qa_failed",
        eventType: "qa_failed",
        eventDescription: "QC failed. The unit must return to diagnosis / repair.",
        orderPatch: {
          qcCompletedAt: now,
        },
      };
    case "pass_qc":
      if (currentStatus !== "awaiting_qc") {
        throw new InternalServiceOrderActionError(
          "Only QC-pending orders can pass QC.",
          409,
        );
      }
      return {
        nextStatus: "ready_for_disposition",
        nextLifecycleState: "qa_passed",
        eventType: "ready_for_disposition",
        eventDescription: "QC passed. The unit is now ready for final disposition.",
        orderPatch: {
          qcCompletedAt: now,
        },
      };
    case "complete_disposition": {
      if (currentStatus !== "ready_for_disposition") {
        throw new InternalServiceOrderActionError(
          "Only QC-passed orders can be completed into disposition.",
          409,
        );
      }

      if (!disposition) {
        throw new InternalServiceOrderActionError(
          "A final disposition is required to complete the order.",
          400,
        );
      }

      const dispositionMap: Record<
        InternalServiceDisposition,
        { lifecycleState: Prisma.AssetIdentityUpdateInput["lifecycleState"]; saleable: boolean }
      > = {
        returned_to_customer: {
          lifecycleState: "ready_for_return",
          saleable: false,
        },
        returned_to_distributor: {
          lifecycleState: "ready_for_return",
          saleable: false,
        },
        returned_to_service_center: {
          lifecycleState: "ready_for_return",
          saleable: false,
        },
        no_fault_found_return: {
          lifecycleState: "ready_for_return",
          saleable: false,
        },
        refurbished_saleable: {
          lifecycleState: "refurbished_saleable",
          saleable: true,
        },
        returned_to_stock: {
          lifecycleState: "returned_to_stock",
          saleable: true,
        },
        scrapped: {
          lifecycleState: "scrapped",
          saleable: false,
        },
        cannibalized: {
          lifecycleState: "cannibalized",
          saleable: false,
        },
      };

      const mapped = dispositionMap[disposition];

      return {
        nextStatus: "completed",
        nextLifecycleState: mapped.lifecycleState,
        eventType: "completed",
        eventDescription: `Final disposition recorded as ${disposition.replace(/_/g, " ")}.`,
        orderPatch: {
          finalDisposition: disposition,
          isSaleableAfterService: mapped.saleable,
          completedAt: now,
        },
      };
    }
    case "close_order":
      if (currentStatus !== "completed") {
        throw new InternalServiceOrderActionError(
          "Only completed internal-service orders can be closed.",
          409,
        );
      }
      return {
        nextStatus: "closed",
        nextLifecycleState: undefined,
        eventType: "closed",
        eventDescription: "Internal-service order closed after final disposition.",
        orderPatch: {
          closedAt: now,
        },
      };
    default:
      return null;
  }
}

function requireAssignedTechnician(
  action: InternalServiceAction,
  assignedTechnicianId: string | null,
) {
  const actionsRequiringAssignment: InternalServiceAction[] = [
    "start_diagnosis",
    "await_parts",
    "start_repair",
    "submit_to_qc",
    "fail_qc",
    "pass_qc",
    "complete_disposition",
    "add_part_usage",
  ];

  if (actionsRequiringAssignment.includes(action) && !assignedTechnicianId) {
    throw new InternalServiceOrderActionError(
      "Assign an engineer before progressing this depot workflow.",
      409,
    );
  }
}

export function normalizeInternalServiceOrderUpdateInput(
  body: UpdateInternalServiceOrderRequest,
) {
  return {
    action: parseAction(body.action),
    assignedTechnicianId: asOptionalString(body.assignedTechnicianId),
    reportedFault: asOptionalString(body.reportedFault),
    diagnosisNotes: asOptionalString(body.diagnosisNotes),
    resolutionNotes: asOptionalString(body.resolutionNotes),
    finalDisposition: parseDisposition(body.finalDisposition),
    partUsage: normalizePartUsageInput(body),
  };
}

export async function updateInternalServiceOrderForDepot(input: {
  organizationId: string;
  dbUserId: string;
  orderId: string;
  update: ReturnType<typeof normalizeInternalServiceOrderUpdateInput>;
}) {
  const order = await db.internalServiceOrder.findFirst({
    where: {
      id: input.orderId,
      serviceCenter: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      assetId: true,
      manufacturerOrgId: true,
      assignedTechnicianId: true,
      finalDisposition: true,
    },
  });

  if (!order) {
    throw new InternalServiceOrderActionError(
      "Internal-service order not found for this depot.",
      404,
    );
  }

  if (order.status === "closed" || order.status === "cancelled") {
    throw new InternalServiceOrderActionError(
      "Closed internal-service orders cannot be updated anymore.",
      409,
    );
  }

  let technician:
    | {
        id: string;
        name: string;
      }
    | null = null;

  if (input.update.assignedTechnicianId) {
    technician = await db.technician.findFirst({
      where: {
        id: input.update.assignedTechnicianId,
        serviceCenter: {
          organizationId: input.organizationId,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!technician) {
      throw new InternalServiceOrderActionError(
        "Assigned engineer does not belong to this depot.",
        404,
      );
    }
  }

  const effectiveAssignedTechnicianId =
    input.update.assignedTechnicianId ?? order.assignedTechnicianId;
  requireAssignedTechnician(input.update.action, effectiveAssignedTechnicianId);

  const now = new Date();
  const transition = buildTransition(
    input.update.action,
    order.status,
    input.update.finalDisposition,
    now,
  );

  const updated = await db.$transaction(async (tx) => {
    const resolvedTrackedPart =
      input.update.partUsage?.partReference
        ? await resolveInternalServiceTrackedPartByReference(
            tx,
            input.update.partUsage.partReference,
            { manufacturerOrgId: order.manufacturerOrgId },
          )
        : null;

    const assignedTechnicianPatch: Prisma.InternalServiceOrderUpdateInput["assignedTechnician"] =
      input.update.action === "assign_engineer"
        ? input.update.assignedTechnicianId
          ? {
              connect: {
                id: input.update.assignedTechnicianId,
              },
            }
          : {
              disconnect: true,
            }
        : input.update.assignedTechnicianId
          ? {
              connect: {
                id: input.update.assignedTechnicianId,
              },
            }
          : undefined;

    const basePatch: Prisma.InternalServiceOrderUpdateInput = {
      assignedTechnician: assignedTechnicianPatch,
      reportedFault: input.update.reportedFault,
      diagnosisNotes: input.update.diagnosisNotes,
      resolutionNotes: input.update.resolutionNotes,
    };

    const orderPatch: Prisma.InternalServiceOrderUpdateInput = transition
      ? {
          ...basePatch,
          status: transition.nextStatus,
          ...transition.orderPatch,
        }
      : basePatch;

    const nextOrder = await tx.internalServiceOrder.update({
      where: {
        id: order.id,
      },
      data: orderPatch,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        assignedTechnicianId: true,
        finalDisposition: true,
      },
    });

    if (transition?.nextLifecycleState) {
      await tx.assetIdentity.update({
        where: {
          id: order.assetId,
        },
        data: {
          lifecycleState: transition.nextLifecycleState,
        },
      });
    }

    if (input.update.action === "add_part_usage" && input.update.partUsage) {
      await tx.jobPartUsage.create({
        data: {
          internalServiceOrderId: order.id,
          mainAssetId: order.assetId,
          usedAssetId: resolvedTrackedPart?.asset.id ?? null,
          usedTagId: resolvedTrackedPart?.tag?.id ?? null,
          usageType: input.update.partUsage.usageType,
          quantity: new Prisma.Decimal(1),
          linkedByUserId: input.dbUserId,
          linkedAt: now,
          metadata: {
            assetReference:
              input.update.partUsage.partReference ??
              resolvedTrackedPart?.asset.publicCode ??
              null,
            tagCode: resolvedTrackedPart?.tag?.publicCode ?? null,
            partName:
              input.update.partUsage.partName ??
              resolvedTrackedPart?.asset.productModel.name ??
              null,
            partNumber:
              input.update.partUsage.partNumber ??
              resolvedTrackedPart?.asset.productModel.modelNumber ??
              null,
            note: input.update.partUsage.partNote,
            traced: Boolean(resolvedTrackedPart),
          } satisfies Prisma.InputJsonValue,
        },
      });

      if (
        resolvedTrackedPart?.asset.id &&
        (input.update.partUsage.usageType === "installed" ||
          input.update.partUsage.usageType === "consumed")
      ) {
        await tx.assetIdentity.update({
          where: {
            id: resolvedTrackedPart.asset.id,
          },
          data: {
            lifecycleState: "consumed",
          },
        });
      }
    }

    const eventDescription = transition?.eventDescription
      ?? (input.update.action === "add_part_usage"
        ? `Part usage recorded as ${input.update.partUsage?.usageType.replace(/_/g, " ")}${
            input.update.partUsage?.partName
              ? ` for ${input.update.partUsage.partName}`
              : input.update.partUsage?.partReference
                ? ` using ${input.update.partUsage.partReference}`
                : ""
          }.`
        : input.update.action === "assign_engineer"
          ? `Engineer assignment updated to ${technician?.name ?? "unassigned"}.`
          : "Internal-service notes updated.");

    await tx.internalServiceTimeline.create({
      data: {
        internalServiceOrderId: order.id,
        eventType: transition?.eventType ?? input.update.action,
        eventDescription,
        actorUserId: input.dbUserId,
        actorRole: "service_center_admin",
        actorName: "Depot Operations",
        metadata: {
          action: input.update.action,
          previousStatus: order.status,
          nextStatus: nextOrder.status,
          assignedTechnicianId: nextOrder.assignedTechnicianId,
          finalDisposition: nextOrder.finalDisposition,
          diagnosisNotes: input.update.diagnosisNotes,
          resolutionNotes: input.update.resolutionNotes,
          reportedFault: input.update.reportedFault,
          partUsageType: input.update.partUsage?.usageType ?? null,
          partReference: input.update.partUsage?.partReference ?? null,
          partName: input.update.partUsage?.partName ?? null,
          partNumber: input.update.partUsage?.partNumber ?? null,
          partNote: input.update.partUsage?.partNote ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    return nextOrder;
  });

  return updated;
}

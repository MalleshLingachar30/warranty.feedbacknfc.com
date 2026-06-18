import { InternalServiceDisposition, Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireServiceCenterContext,
} from "@/app/api/service-center/_utils";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type InternalServiceAction =
  | "save_notes"
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

type UpdateInternalServiceOrderRequest = {
  action?: unknown;
  assignedTechnicianId?: unknown;
  reportedFault?: unknown;
  diagnosisNotes?: unknown;
  resolutionNotes?: unknown;
  finalDisposition?: unknown;
};

type StatusTransition = {
  nextStatus: Prisma.InternalServiceOrderUpdateInput["status"];
  nextLifecycleState: Prisma.AssetIdentityUpdateInput["lifecycleState"];
  eventType: string;
  eventDescription: string;
  orderPatch?: Prisma.InternalServiceOrderUpdateInput;
};

function asOptionalString(value: unknown) {
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
      throw new ApiError("Unsupported internal-service action.", 400);
  }
}

function parseDisposition(value: unknown) {
  const disposition = asOptionalString(value);
  if (!disposition) {
    return null;
  }

  if (!(disposition in InternalServiceDisposition)) {
    throw new ApiError("Unsupported internal-service disposition.", 400);
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
    case "assign_engineer":
      return null;
    case "mark_triaged":
      if (currentStatus !== "inward_received") {
        throw new ApiError("Only inward-received orders can be marked as triaged.", 409);
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
        throw new ApiError("Only triaged or QC-failed orders can enter diagnosis.", 409);
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
        throw new ApiError("Only orders under diagnosis can be marked as awaiting parts.", 409);
      }
      return {
        nextStatus: "awaiting_parts",
        nextLifecycleState: "awaiting_parts",
        eventType: "awaiting_parts",
        eventDescription: "Diagnosis concluded that additional parts are required.",
      };
    case "start_repair":
      if (currentStatus !== "under_diagnosis" && currentStatus !== "awaiting_parts") {
        throw new ApiError("Only diagnosed or parts-waiting orders can start repair.", 409);
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
        throw new ApiError("Only orders under repair can be submitted to QC.", 409);
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
        throw new ApiError("Only QC-pending orders can fail QC.", 409);
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
        throw new ApiError("Only QC-pending orders can pass QC.", 409);
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
        throw new ApiError("Only QC-passed orders can be completed into disposition.", 409);
      }

      if (!disposition) {
        throw new ApiError("A final disposition is required to complete the order.", 400);
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
        throw new ApiError("Only completed internal-service orders can be closed.", 409);
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
  ];

  if (actionsRequiringAssignment.includes(action) && !assignedTechnicianId) {
    throw new ApiError("Assign an engineer before progressing this depot workflow.", 409);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId, dbUserId } = await requireServiceCenterContext();
    const { id } = await context.params;
    const body = parseJsonBody<UpdateInternalServiceOrderRequest>(await request.json());

    if (!dbUserId) {
      throw new ApiError("Service-center user is not linked to a local user record.", 400);
    }

    if (!id) {
      throw new ApiError("Internal-service order id is required.", 400);
    }

    const action = parseAction(body.action);
    const assignedTechnicianId = asOptionalString(body.assignedTechnicianId);
    const reportedFault = asOptionalString(body.reportedFault);
    const diagnosisNotes = asOptionalString(body.diagnosisNotes);
    const resolutionNotes = asOptionalString(body.resolutionNotes);
    const finalDisposition = parseDisposition(body.finalDisposition);

    const order = await db.internalServiceOrder.findFirst({
      where: {
        id,
        serviceCenter: {
          organizationId,
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        assetId: true,
        assignedTechnicianId: true,
        finalDisposition: true,
      },
    });

    if (!order) {
      throw new ApiError("Internal-service order not found for this depot.", 404);
    }

    if (order.status === "closed" || order.status === "cancelled") {
      throw new ApiError("Closed internal-service orders cannot be updated anymore.", 409);
    }

    let technician:
      | {
          id: string;
          name: string;
        }
      | null = null;

    if (assignedTechnicianId) {
      technician = await db.technician.findFirst({
        where: {
          id: assignedTechnicianId,
          serviceCenter: {
            organizationId,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!technician) {
        throw new ApiError("Assigned engineer does not belong to this depot.", 404);
      }
    }

    const effectiveAssignedTechnicianId = assignedTechnicianId ?? order.assignedTechnicianId;
    requireAssignedTechnician(action, effectiveAssignedTechnicianId);

    const now = new Date();
    const transition = buildTransition(action, order.status, finalDisposition, now);

    const updated = await db.$transaction(async (tx) => {
      const assignedTechnicianPatch: Prisma.InternalServiceOrderUpdateInput["assignedTechnician"] =
        action === "assign_engineer"
          ? assignedTechnicianId
            ? {
                connect: {
                  id: assignedTechnicianId,
                },
              }
            : {
                disconnect: true,
              }
          : assignedTechnicianId
            ? {
                connect: {
                  id: assignedTechnicianId,
                },
              }
            : undefined;

      const basePatch: Prisma.InternalServiceOrderUpdateInput = {
        assignedTechnician: assignedTechnicianPatch,
        reportedFault,
        diagnosisNotes,
        resolutionNotes,
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

      const eventDescription =
        transition?.eventDescription ??
        (action === "assign_engineer"
          ? `Engineer assignment updated to ${technician?.name ?? "unassigned"}.`
          : "Internal-service notes updated.");

      await tx.internalServiceTimeline.create({
        data: {
          internalServiceOrderId: order.id,
          eventType: transition?.eventType ?? action,
          eventDescription,
          actorUserId: dbUserId,
          actorRole: "service_center_admin",
          actorName: "Depot Operations",
          metadata: {
            action,
            previousStatus: order.status,
            nextStatus: nextOrder.status,
            assignedTechnicianId: nextOrder.assignedTechnicianId,
            finalDisposition: nextOrder.finalDisposition,
            diagnosisNotes,
            resolutionNotes,
            reportedFault,
          } as Prisma.InputJsonValue,
        },
      });

      return nextOrder;
    });

    return NextResponse.json({
      success: true,
      order: updated,
    });
  } catch (error) {
    return jsonError(error);
  }
}

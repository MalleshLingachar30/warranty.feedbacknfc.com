import { NextResponse, type NextRequest } from "next/server";

import { requireServiceCenterContext } from "@/app/api/service-center/_utils";
import {
  InternalServiceOrderActionError,
  type UpdateInternalServiceOrderRequest,
  normalizeInternalServiceOrderUpdateInput,
  updateInternalServiceOrderForDepot,
} from "@/lib/internal-service-order-actions";

export const runtime = "nodejs";

function asFormString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detailPath = `/dashboard/internal-services/orders/${id}`;
  const redirectUrl = new URL(detailPath, request.url);

  try {
    const { organizationId, dbUserId } = await requireServiceCenterContext();
    const formData = await request.formData();

    if (!dbUserId) {
      throw new InternalServiceOrderActionError(
        "Service-center user is not linked to a local user record.",
        400,
      );
    }

    if (!id) {
      throw new InternalServiceOrderActionError(
        "Internal-service order id is required.",
        400,
      );
    }

    const update = normalizeInternalServiceOrderUpdateInput({
      action: asFormString(formData.get("action")),
      assignedTechnicianId: asFormString(formData.get("assignedTechnicianId")),
      reportedFault: asFormString(formData.get("reportedFault")),
      diagnosisNotes: asFormString(formData.get("diagnosisNotes")),
      resolutionNotes: asFormString(formData.get("resolutionNotes")),
      finalDisposition: asFormString(formData.get("finalDisposition")),
    } satisfies UpdateInternalServiceOrderRequest);

    await updateInternalServiceOrderForDepot({
      organizationId,
      dbUserId,
      orderId: id,
      update,
    });

    redirectUrl.searchParams.set("updated", update.action);
  } catch (error) {
    const message =
      error instanceof InternalServiceOrderActionError
        ? error.message
        : "Unable to update the internal-service order.";

    redirectUrl.searchParams.set("error", message);
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detailPath = `/dashboard/internal-services/orders/${id}`;
  const redirectUrl = new URL(detailPath, request.url);

  try {
    const { organizationId, dbUserId } = await requireServiceCenterContext();
    const action = request.nextUrl.searchParams.get("action") ?? undefined;

    if (!dbUserId) {
      throw new InternalServiceOrderActionError(
        "Service-center user is not linked to a local user record.",
        400,
      );
    }

    if (!id) {
      throw new InternalServiceOrderActionError(
        "Internal-service order id is required.",
        400,
      );
    }

    const update = normalizeInternalServiceOrderUpdateInput({
      action,
    } satisfies UpdateInternalServiceOrderRequest);

    await updateInternalServiceOrderForDepot({
      organizationId,
      dbUserId,
      orderId: id,
      update,
    });

    redirectUrl.searchParams.set("updated", update.action);
  } catch (error) {
    const message =
      error instanceof InternalServiceOrderActionError
        ? error.message
        : "Unable to update the internal-service order.";

    redirectUrl.searchParams.set("error", message);
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}

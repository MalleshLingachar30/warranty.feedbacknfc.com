import { NextResponse, type NextRequest } from "next/server";

import { requireInternalServiceContext } from "@/app/api/service-center/_utils";
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

function sanitizeReturnTo(value: string | undefined, fallbackPath: string) {
  if (!value) {
    return fallbackPath;
  }

  if (!value.startsWith("/dashboard/internal-services")) {
    return fallbackPath;
  }

  return value;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detailPath = `/dashboard/internal-services/orders/${id}`;

  try {
    const { organizationId, dbUserId } = await requireInternalServiceContext();
    const formData = await request.formData();
    const returnTo = sanitizeReturnTo(
      asFormString(formData.get("returnTo")),
      detailPath,
    );
    const redirectUrl = new URL(returnTo, request.url);

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
      station: asFormString(formData.get("station")),
      stationLease: asFormString(formData.get("stationLease")),
      assignedTechnicianId: asFormString(formData.get("assignedTechnicianId")),
      reportedFault: asFormString(formData.get("reportedFault")),
      diagnosisNotes: asFormString(formData.get("diagnosisNotes")),
      resolutionNotes: asFormString(formData.get("resolutionNotes")),
      finalDisposition: asFormString(formData.get("finalDisposition")),
      partUsageType: asFormString(formData.get("partUsageType")),
      partReference: asFormString(formData.get("partReference")),
      partName: asFormString(formData.get("partName")),
      partNumber: asFormString(formData.get("partNumber")),
      partNote: asFormString(formData.get("partNote")),
    } satisfies UpdateInternalServiceOrderRequest);

    await updateInternalServiceOrderForDepot({
      organizationId,
      dbUserId,
      orderId: id,
      update,
    });

    redirectUrl.searchParams.set("updated", update.action);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  } catch (error) {
    const returnTo = sanitizeReturnTo(undefined, detailPath);
    const redirectUrl = new URL(returnTo, request.url);
    const message =
      error instanceof InternalServiceOrderActionError
        ? error.message
        : "Unable to update the internal-service order.";

    redirectUrl.searchParams.set("error", message);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detailPath = `/dashboard/internal-services/orders/${id}`;

  try {
    const { organizationId, dbUserId } = await requireInternalServiceContext();
    const action = request.nextUrl.searchParams.get("action") ?? undefined;
    const finalDisposition =
      request.nextUrl.searchParams.get("finalDisposition") ?? undefined;
    const returnTo = sanitizeReturnTo(
      request.nextUrl.searchParams.get("returnTo") ?? undefined,
      detailPath,
    );
    const redirectUrl = new URL(returnTo, request.url);

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
      station: request.nextUrl.searchParams.get("station") ?? undefined,
      stationLease:
        request.nextUrl.searchParams.get("stationLease") ?? undefined,
      finalDisposition,
    } satisfies UpdateInternalServiceOrderRequest);

    await updateInternalServiceOrderForDepot({
      organizationId,
      dbUserId,
      orderId: id,
      update,
    });

    redirectUrl.searchParams.set("updated", update.action);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  } catch (error) {
    const returnTo = sanitizeReturnTo(
      request.nextUrl.searchParams.get("returnTo") ?? undefined,
      detailPath,
    );
    const redirectUrl = new URL(returnTo, request.url);
    const message =
      error instanceof InternalServiceOrderActionError
        ? error.message
        : "Unable to update the internal-service order.";

    redirectUrl.searchParams.set("error", message);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }
}

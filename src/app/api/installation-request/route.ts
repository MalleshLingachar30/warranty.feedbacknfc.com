import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { createInstallationJobFromSaleRegistration } from "@/lib/installation-job-creation";
import {
  installationJobLifecycleState,
  parseOptionalDate,
  parseOptionalString,
} from "@/lib/installation-workflow";
import { serializeInstallationJobRow } from "@/lib/installation-workflow-view";
import { isValidOtpPhone, normalizePhone } from "@/lib/otp-session";

export const runtime = "nodejs";

type InstallationRequestPayload = {
  tagCode?: unknown;
  requesterName?: unknown;
  requesterPhone?: unknown;
  requesterEmail?: unknown;
  siteName?: unknown;
  installAddress?: unknown;
  installCity?: unknown;
  installState?: unknown;
  installPincode?: unknown;
  preferredDate?: unknown;
  note?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as InstallationRequestPayload;

    const tagCode = parseOptionalString(body.tagCode);
    const requesterName = parseOptionalString(body.requesterName);
    const requesterPhone = normalizePhone(
      parseOptionalString(body.requesterPhone) ?? "",
    );
    const requesterEmail = parseOptionalString(body.requesterEmail);
    const siteName = parseOptionalString(body.siteName);
    const installAddress = parseOptionalString(body.installAddress);
    const installCity = parseOptionalString(body.installCity);
    const installState = parseOptionalString(body.installState);
    const installPincode = parseOptionalString(body.installPincode);
    const preferredDateValue = parseOptionalString(body.preferredDate);
    const preferredDate = parseOptionalDate(body.preferredDate);
    const note = parseOptionalString(body.note);

    if (!tagCode) {
      return NextResponse.json(
        { error: "A valid QR resolver code is required." },
        { status: 400 },
      );
    }

    if (
      !requesterName ||
      !requesterPhone ||
      !siteName ||
      !installAddress ||
      !installCity ||
      !installState ||
      !installPincode
    ) {
      return NextResponse.json(
        {
          error:
            "Requester name, phone, site name, and complete installation address are required.",
        },
        { status: 400 },
      );
    }

    if (!isValidOtpPhone(requesterPhone)) {
      return NextResponse.json(
        { error: "Requester phone number is invalid." },
        { status: 400 },
      );
    }

    if (preferredDateValue && !preferredDate) {
      return NextResponse.json(
        { error: "Preferred installation date is invalid." },
        { status: 400 },
      );
    }

    const resolvedTag = await db.assetTag.findFirst({
      where: {
        OR: [
          {
            publicCode: {
              equals: tagCode,
              mode: "insensitive",
            },
          },
          {
            microResolverCode: {
              equals: tagCode,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        publicCode: true,
        tagClass: true,
        asset: {
          select: {
            id: true,
            organizationId: true,
            publicCode: true,
            serialNumber: true,
            lifecycleState: true,
            productClass: true,
            productModel: {
              select: {
                name: true,
                installationRequired: true,
                activationMode: true,
                installationChecklistTemplate: true,
                commissioningTemplate: true,
              },
            },
            saleRegistration: {
              select: {
                id: true,
                status: true,
                installationJob: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!resolvedTag || resolvedTag.asset.productClass !== "main_product") {
      return NextResponse.json(
        { error: "This QR code does not reference an installable main product." },
        { status: 404 },
      );
    }

    const isInstallationDriven =
      resolvedTag.asset.productModel.activationMode === "installation_driven" ||
      resolvedTag.asset.productModel.installationRequired;
    const isInstallationPendingLifecycle =
      resolvedTag.asset.lifecycleState === "sold_pending_installation" ||
      resolvedTag.asset.lifecycleState === "installation_scheduled" ||
      resolvedTag.asset.lifecycleState === "installation_in_progress";
    const supportsInstallationRequest =
      isInstallationDriven ||
      isInstallationPendingLifecycle ||
      Boolean(resolvedTag.asset.saleRegistration);

    if (!supportsInstallationRequest) {
      return NextResponse.json(
        { error: "This product does not use the installation-request flow." },
        { status: 409 },
      );
    }

    const registration = resolvedTag.asset.saleRegistration;
    if (!registration) {
      return NextResponse.json(
        {
          error:
            "Sale registration is not complete for this machine yet. Installation cannot be requested until dispatch handoff is registered.",
        },
        { status: 409 },
      );
    }

    if (registration.installationJob?.id) {
      return NextResponse.json(
        {
          error:
            "An installation request already exists for this machine. The service team will continue from the existing job.",
        },
        { status: 409 },
      );
    }

    const created = await db.$transaction(async (tx) => {
      const job = await createInstallationJobFromSaleRegistration({
        tx,
        assetId: resolvedTag.asset.id,
        saleRegistrationId: registration.id,
        manufacturerOrgId: resolvedTag.asset.organizationId,
        checklistTemplateSnapshot: resolvedTag.asset.productModel
          .installationChecklistTemplate as Prisma.InputJsonValue,
        commissioningTemplateSnapshot: resolvedTag.asset.productModel
          .commissioningTemplate as Prisma.InputJsonValue,
        metadata: {
          seededFromSaleRegistrationId: registration.id,
          installationRequest: {
            channel: "qr_self_service",
            resolverCode: resolvedTag.publicCode,
            requesterName,
            requesterPhone,
            requesterEmail,
            siteName,
            installAddress,
            installCity,
            installState,
            installPincode,
            preferredDate: preferredDateValue,
            note,
            requestedAt: new Date().toISOString(),
          },
        } satisfies Prisma.InputJsonValue,
      });

      await tx.saleRegistration.update({
        where: {
          id: registration.id,
        },
        data: {
          status: "job_created",
        },
      });

      await tx.assetIdentity.update({
        where: {
          id: resolvedTag.asset.id,
        },
        data: {
          lifecycleState: installationJobLifecycleState(job.status),
        },
      });

      return job;
    });

    return NextResponse.json(
      {
        job: serializeInstallationJobRow(created),
        successMessage:
          "Installation request received. The service team will assign this machine for scheduling.",
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create the installation request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { createInstallationJobFromSaleRegistration } from "@/lib/installation-job-creation";
import {
  installationJobLifecycleState,
  parseOptionalDate,
  parseOptionalString,
} from "@/lib/installation-workflow";
import {
  installationJobSelect,
  serializeInstallationJobRow,
} from "@/lib/installation-workflow-view";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../../../_utils";

type CreateInstallationJobPayload = {
  assignedServiceCenterId?: unknown;
  scheduledFor?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<CreateInstallationJobPayload>(
      await request.json(),
    );
    const { id } = await params;

    const registration = await db.saleRegistration.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        assetId: true,
        asset: {
          select: {
            id: true,
            productModel: {
              select: {
                installationChecklistTemplate: true,
                commissioningTemplate: true,
              },
            },
          },
        },
        installationJob: {
          select: installationJobSelect,
        },
      },
    });

    if (!registration) {
      throw new ApiError("Sale registration not found.", 404);
    }

    if (registration.installationJob) {
      return NextResponse.json({
        job: serializeInstallationJobRow(registration.installationJob),
      });
    }

    const assignedServiceCenterId = parseOptionalString(
      body.assignedServiceCenterId,
    );
    const scheduledFor = parseOptionalDate(body.scheduledFor);

    if (assignedServiceCenterId) {
      const center = await db.serviceCenter.findFirst({
        where: {
          id: assignedServiceCenterId,
          OR: [
            {
              manufacturerAuthorizations: {
                has: organizationId,
              },
            },
            {
              organizationId,
            },
          ],
        },
        select: {
          id: true,
        },
      });

      if (!center) {
        throw new ApiError("Assigned service center is not authorized.", 400);
      }
    }

    const job = await db.$transaction(async (tx) => {
      const created = await createInstallationJobFromSaleRegistration({
        tx,
        assetId: registration.assetId,
        saleRegistrationId: registration.id,
        manufacturerOrgId: organizationId,
        assignedServiceCenterId,
        scheduledFor,
        checklistTemplateSnapshot: registration.asset.productModel
          .installationChecklistTemplate as Prisma.InputJsonValue,
        commissioningTemplateSnapshot: registration.asset.productModel
          .commissioningTemplate as Prisma.InputJsonValue,
        metadata: {
          seededFromSaleRegistrationId: registration.id,
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
          id: registration.assetId,
        },
        data: {
          lifecycleState: installationJobLifecycleState(created.status),
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        job: serializeInstallationJobRow(job),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

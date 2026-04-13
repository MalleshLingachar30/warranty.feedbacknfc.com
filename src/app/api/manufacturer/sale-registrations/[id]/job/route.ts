import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
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

const MAX_JOB_NUMBER_ATTEMPTS = 5;

async function generateInstallationJobNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const prefix = `INS-${year}-`;

  const latest = await tx.installationJob.findFirst({
    where: {
      jobNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      jobNumber: "desc",
    },
    select: {
      jobNumber: true,
    },
  });

  const match = latest?.jobNumber.match(new RegExp(`^INS-${year}-(\\d+)$`));
  const nextValue = match?.[1] ? Number.parseInt(match[1], 10) + 1 : 1;

  return `INS-${year}-${String(nextValue).padStart(6, "0")}`;
}

function isJobNumberUniqueCollision(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  if (typeof target === "string") {
    return target.includes("job_number") || target.includes("jobNumber");
  }

  if (Array.isArray(target)) {
    return target.some(
      (entry) =>
        typeof entry === "string" &&
        (entry.includes("job_number") || entry.includes("jobNumber")),
    );
  }

  return false;
}

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

    let job = null;

    for (let attempt = 0; attempt < MAX_JOB_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        job = await db.$transaction(async (tx) => {
          const jobNumber = await generateInstallationJobNumber(tx);
          const status = scheduledFor
            ? "scheduled"
            : assignedServiceCenterId
              ? "assigned"
              : "pending_assignment";

          const created = await tx.installationJob.create({
            data: {
              jobNumber,
              assetId: registration.assetId,
              saleRegistrationId: registration.id,
              manufacturerOrgId: organizationId,
              assignedServiceCenterId,
              status,
              scheduledFor,
              checklistTemplateSnapshot: registration.asset.productModel
                .installationChecklistTemplate as Prisma.InputJsonValue,
              commissioningTemplateSnapshot: registration.asset.productModel
                .commissioningTemplate as Prisma.InputJsonValue,
              metadata: {
                seededFromSaleRegistrationId: registration.id,
              } satisfies Prisma.InputJsonValue,
            },
            select: installationJobSelect,
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
              lifecycleState: installationJobLifecycleState(status),
            },
          });

          return created;
        });

        break;
      } catch (error) {
        if (
          isJobNumberUniqueCollision(error) &&
          attempt < MAX_JOB_NUMBER_ATTEMPTS - 1
        ) {
          continue;
        }

        throw error;
      }
    }

    if (!job) {
      throw new ApiError("Unable to create installation job.", 500);
    }

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

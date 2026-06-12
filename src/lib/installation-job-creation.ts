import { Prisma } from "@prisma/client";

import { installationJobSelect } from "@/lib/installation-workflow-view";

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

export async function createInstallationJobFromSaleRegistration(input: {
  tx: Prisma.TransactionClient;
  assetId: string;
  saleRegistrationId: string;
  manufacturerOrgId: string;
  assignedServiceCenterId?: string | null;
  scheduledFor?: Date | null;
  checklistTemplateSnapshot: Prisma.InputJsonValue;
  commissioningTemplateSnapshot: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}) {
  for (let attempt = 0; attempt < MAX_JOB_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      const jobNumber = await generateInstallationJobNumber(input.tx);
      const status = input.scheduledFor
        ? "scheduled"
        : input.assignedServiceCenterId
          ? "assigned"
          : "pending_assignment";

      const created = await input.tx.installationJob.create({
        data: {
          jobNumber,
          assetId: input.assetId,
          saleRegistrationId: input.saleRegistrationId,
          manufacturerOrgId: input.manufacturerOrgId,
          assignedServiceCenterId: input.assignedServiceCenterId ?? null,
          status,
          scheduledFor: input.scheduledFor ?? null,
          checklistTemplateSnapshot: input.checklistTemplateSnapshot,
          commissioningTemplateSnapshot: input.commissioningTemplateSnapshot,
          metadata: input.metadata ?? {},
        },
        select: installationJobSelect,
      });

      return created;
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

  throw new Error("Unable to create installation job.");
}

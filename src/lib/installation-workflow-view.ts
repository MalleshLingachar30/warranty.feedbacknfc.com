import { Prisma, type TagClass } from "@prisma/client";

import type {
  InstallationJobRow,
  SaleRegistrationRow,
  ServiceCenterOption,
} from "@/components/manufacturer/types";

const SALE_REGISTRATION_TAG_CLASSES: TagClass[] = [
  "unit_service",
  "carton_registration",
];

export const saleRegistrationSelect =
  Prisma.validator<Prisma.SaleRegistrationSelect>()({
    id: true,
    assetId: true,
    channel: true,
    status: true,
    purchaseDate: true,
    registeredAt: true,
    dealerName: true,
    distributorName: true,
    asset: {
      select: {
        publicCode: true,
        serialNumber: true,
        lifecycleState: true,
        productModel: {
          select: {
            name: true,
            modelNumber: true,
            activationMode: true,
          },
        },
        tags: {
          where: {
            tagClass: {
              in: SALE_REGISTRATION_TAG_CLASSES,
            },
          },
          select: {
            publicCode: true,
            tagClass: true,
          },
        },
      },
    },
    salesLine: {
      select: {
        id: true,
        sourceDocumentNumber: true,
        sourceLineNumber: true,
        sourceRecordKey: true,
        itemCode: true,
        transactionDate: true,
        warehouseCode: true,
      },
    },
    installationJob: {
      select: {
        id: true,
        jobNumber: true,
        status: true,
        scheduledFor: true,
        assignedServiceCenter: {
          select: {
            name: true,
          },
        },
      },
    },
  });

type SaleRegistrationRecord = Prisma.SaleRegistrationGetPayload<{
  select: typeof saleRegistrationSelect;
}>;

export const installationJobSelect =
  Prisma.validator<Prisma.InstallationJobSelect>()({
    id: true,
    jobNumber: true,
    status: true,
    scheduledFor: true,
    createdAt: true,
    assetId: true,
    asset: {
      select: {
        publicCode: true,
        serialNumber: true,
        lifecycleState: true,
        productModel: {
          select: {
            name: true,
            modelNumber: true,
          },
        },
      },
    },
    saleRegistration: {
      select: {
        id: true,
        registeredAt: true,
      },
    },
    assignedServiceCenter: {
      select: {
        id: true,
        name: true,
        city: true,
      },
    },
    assignedTechnician: {
      select: {
        name: true,
      },
    },
  });

type InstallationJobRecord = Prisma.InstallationJobGetPayload<{
  select: typeof installationJobSelect;
}>;

export function serializeServiceCenterOption(input: {
  id: string;
  name: string;
  city: string | null;
}): ServiceCenterOption {
  return {
    id: input.id,
    name: input.name,
    city: input.city ?? "-",
  };
}

export function serializeSaleRegistrationRow(
  registration: SaleRegistrationRecord,
): SaleRegistrationRow {
  const unitTagCode =
    registration.asset.tags.find((tag) => tag.tagClass === "unit_service")
      ?.publicCode ?? null;
  const cartonTagCode =
    registration.asset.tags.find(
      (tag) => tag.tagClass === "carton_registration",
    )?.publicCode ?? null;

  return {
    id: registration.id,
    assetId: registration.assetId,
    assetCode: registration.asset.publicCode,
    serialNumber: registration.asset.serialNumber ?? "Unassigned",
    assetLifecycleState: registration.asset.lifecycleState,
    productModel: {
      name: registration.asset.productModel.name,
      modelNumber: registration.asset.productModel.modelNumber ?? "",
      activationMode: registration.asset.productModel.activationMode,
    },
    channel: registration.channel,
    status: registration.status,
    purchaseDate: registration.purchaseDate?.toISOString() ?? null,
    registeredAt: registration.registeredAt.toISOString(),
    dealerName: registration.dealerName,
    distributorName: registration.distributorName,
    salesLine: registration.salesLine
      ? {
          id: registration.salesLine.id,
          sourceDocumentNumber: registration.salesLine.sourceDocumentNumber,
          sourceLineNumber: registration.salesLine.sourceLineNumber,
          sourceRecordKey: registration.salesLine.sourceRecordKey,
          itemCode: registration.salesLine.itemCode,
          transactionDate:
            registration.salesLine.transactionDate?.toISOString() ?? null,
          warehouseCode: registration.salesLine.warehouseCode,
        }
      : null,
    tags: {
      unitTagCode,
      cartonTagCode,
    },
    installationJob: registration.installationJob
      ? {
          id: registration.installationJob.id,
          jobNumber: registration.installationJob.jobNumber,
          status: registration.installationJob.status,
          scheduledFor:
            registration.installationJob.scheduledFor?.toISOString() ?? null,
          assignedServiceCenterName:
            registration.installationJob.assignedServiceCenter?.name ?? null,
        }
      : null,
  };
}

export function serializeInstallationJobRow(
  job: InstallationJobRecord,
): InstallationJobRow {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    scheduledFor: job.scheduledFor?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    assetId: job.assetId,
    assetCode: job.asset.publicCode,
    serialNumber: job.asset.serialNumber ?? "Unassigned",
    assetLifecycleState: job.asset.lifecycleState,
    saleRegistrationId: job.saleRegistration?.id ?? null,
    saleRegisteredAt: job.saleRegistration?.registeredAt.toISOString() ?? null,
    productModel: {
      name: job.asset.productModel.name,
      modelNumber: job.asset.productModel.modelNumber ?? "",
    },
    assignedServiceCenter: job.assignedServiceCenter
      ? {
          id: job.assignedServiceCenter.id,
          name: job.assignedServiceCenter.name,
          city: job.assignedServiceCenter.city ?? "-",
        }
      : null,
    assignedTechnicianName: job.assignedTechnician?.name ?? null,
  };
}

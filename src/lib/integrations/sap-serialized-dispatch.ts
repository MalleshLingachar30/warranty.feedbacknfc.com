import { Prisma, type PrismaClient } from "@prisma/client";

import {
  buildSerializedSalesLineSourceKey,
  saleRegistrationLifecycleState,
} from "@/lib/installation-workflow";

type Tx = Prisma.TransactionClient | PrismaClient;
type GenericRecord = Record<string, unknown>;

export type SapSerializedDispatchRow = {
  sourceDocumentNumber: string | null;
  sourceLineNumber: string | null;
  itemCode: string | null;
  itemDescription: string | null;
  serialNumber: string;
  distributorCode: string | null;
  distributorName: string | null;
  warehouseCode: string | null;
  transactionDate: Date | null;
  quantity: number;
  sourceSystem: string;
};

export type SapSerializedDispatchApplyResult = {
  erpSerializedDispatchRecordId: string;
  serializedSalesLineId: string | null;
  saleRegistrationId: string | null;
  assetId: string | null;
  status: "applied" | "pending_match";
};

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown, fallback = 1): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Number(parsed.toFixed(2));
}

function asDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function readFirstString(source: GenericRecord, keys: string[]) {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

export function normalizeSapSerializedDispatchRow(value: unknown): {
  normalized: SapSerializedDispatchRow | null;
  errors: string[];
} {
  if (!isRecord(value)) {
    return {
      normalized: null,
      errors: ["Each serialized dispatch row must be a JSON object."],
    };
  }

  const serialNumber = readFirstString(value, ["serialNumber", "serial_number"]);
  const sourceDocumentNumber = readFirstString(value, [
    "sourceDocumentNumber",
    "source_document_number",
    "documentNumber",
    "document_number",
    "invoiceNumber",
    "invoice_number",
  ]);
  const sourceLineNumber = readFirstString(value, [
    "sourceLineNumber",
    "source_line_number",
    "lineNumber",
    "line_number",
  ]);

  const normalized =
    serialNumber
      ? {
          sourceDocumentNumber,
          sourceLineNumber,
          itemCode: readFirstString(value, [
            "itemCode",
            "item_code",
            "materialCode",
            "material_code",
          ]),
          itemDescription: readFirstString(value, [
            "itemDescription",
            "item_description",
            "description",
          ]),
          serialNumber,
          distributorCode: readFirstString(value, [
            "distributorCode",
            "distributor_code",
            "customerCode",
            "customer_code",
          ]),
          distributorName: readFirstString(value, [
            "distributorName",
            "distributor_name",
            "customerName",
            "customer_name",
          ]),
          warehouseCode: readFirstString(value, [
            "warehouseCode",
            "warehouse_code",
          ]),
          transactionDate: asDate(
            value.transactionDate ?? value.transaction_date ?? value.invoiceDate,
          ),
          quantity: asNumber(value.quantity, 1),
          sourceSystem: asString(value.sourceSystem ?? value.source_system) ?? "sap",
        }
      : null;

  const errors: string[] = [];
  if (!serialNumber) {
    errors.push("Missing serial number.");
  }

  return {
    normalized,
    errors,
  };
}

export async function applySapSerializedDispatchRow(
  tx: Tx,
  input: {
    organizationId: string;
    row: SapSerializedDispatchRow;
    rawPayload: Prisma.InputJsonValue;
    normalizedPayload: Prisma.InputJsonValue;
    lastRunId?: string | null;
  },
): Promise<SapSerializedDispatchApplyResult> {
  const productModel = input.row.itemCode
    ? await tx.productModel.findFirst({
        where: {
          organizationId: input.organizationId,
          externalItemCode: input.row.itemCode,
        },
        select: {
          id: true,
        },
      })
    : null;

  const mappedDistributor = input.row.distributorCode
    ? await tx.organization.findFirst({
        where: {
          parentOrganizationId: input.organizationId,
          type: "distributor",
          externalCode: input.row.distributorCode,
        },
        select: {
          id: true,
          name: true,
        },
      })
    : null;

  const asset = await tx.assetIdentity.findFirst({
    where: {
      organizationId: input.organizationId,
      productClass: "main_product",
      serialNumber: input.row.serialNumber,
      ...(productModel ? { productModelId: productModel.id } : {}),
    },
    select: {
      id: true,
      lifecycleState: true,
    },
  });

  const sourceRecordKey = buildSerializedSalesLineSourceKey({
    sourceDocumentNumber: input.row.sourceDocumentNumber,
    sourceLineNumber: input.row.sourceLineNumber,
    serialNumber: input.row.serialNumber,
  });

  const status = asset ? "applied" : "pending_match";

  const erpRecord = await tx.erpSerializedDispatchRecord.upsert({
    where: {
      organizationId_externalRecordKey: {
        organizationId: input.organizationId,
        externalRecordKey: sourceRecordKey ?? input.row.serialNumber,
      },
    },
    create: {
      organizationId: input.organizationId,
      externalDocumentNumber: input.row.sourceDocumentNumber,
      externalLineNumber: input.row.sourceLineNumber,
      externalRecordKey: sourceRecordKey ?? input.row.serialNumber,
      itemCode: input.row.itemCode,
      serialNumber: input.row.serialNumber,
      distributorCode: input.row.distributorCode,
      warehouseCode: input.row.warehouseCode,
      transactionDate: input.row.transactionDate,
      quantity: input.row.quantity,
      sourceSystem: input.row.sourceSystem,
      status,
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      assetId: asset?.id ?? null,
      productModelId: productModel?.id ?? null,
      mappedDistributorId: mappedDistributor?.id ?? null,
      lastRunId: input.lastRunId ?? null,
    },
    update: {
      externalDocumentNumber: input.row.sourceDocumentNumber,
      externalLineNumber: input.row.sourceLineNumber,
      itemCode: input.row.itemCode,
      serialNumber: input.row.serialNumber,
      distributorCode: input.row.distributorCode,
      warehouseCode: input.row.warehouseCode,
      transactionDate: input.row.transactionDate,
      quantity: input.row.quantity,
      sourceSystem: input.row.sourceSystem,
      status,
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      assetId: asset?.id ?? null,
      productModelId: productModel?.id ?? null,
      mappedDistributorId: mappedDistributor?.id ?? null,
      lastRunId: input.lastRunId ?? null,
      lastImportedAt: new Date(),
    },
    select: {
      id: true,
    },
  });

  if (!asset) {
    return {
      erpSerializedDispatchRecordId: erpRecord.id,
      serializedSalesLineId: null,
      saleRegistrationId: null,
      assetId: null,
      status,
    };
  }

  const serializedSalesLine = await tx.serializedSalesLine.upsert({
    where: {
      assetId: asset.id,
    },
    create: {
      organizationId: input.organizationId,
      assetId: asset.id,
      sourceDocumentNumber: input.row.sourceDocumentNumber,
      sourceLineNumber: input.row.sourceLineNumber,
      sourceRecordKey,
      itemCode: input.row.itemCode,
      itemDescription: input.row.itemDescription,
      serialNumber: input.row.serialNumber,
      quantity: input.row.quantity,
      distributorName:
        mappedDistributor?.name ?? input.row.distributorName ?? null,
      warehouseCode: input.row.warehouseCode,
      transactionDate: input.row.transactionDate,
      sourceSystem: input.row.sourceSystem,
      metadata: {
        distributorCode: input.row.distributorCode,
        source: "sap_serialized_dispatch",
      } as Prisma.InputJsonValue,
    },
    update: {
      sourceDocumentNumber: input.row.sourceDocumentNumber,
      sourceLineNumber: input.row.sourceLineNumber,
      sourceRecordKey,
      itemCode: input.row.itemCode,
      itemDescription: input.row.itemDescription,
      serialNumber: input.row.serialNumber,
      quantity: input.row.quantity,
      distributorName:
        mappedDistributor?.name ?? input.row.distributorName ?? null,
      warehouseCode: input.row.warehouseCode,
      transactionDate: input.row.transactionDate,
      sourceSystem: input.row.sourceSystem,
      metadata: {
        distributorCode: input.row.distributorCode,
        source: "sap_serialized_dispatch",
      } as Prisma.InputJsonValue,
    },
    select: {
      id: true,
    },
  });

  const existingRegistration = await tx.saleRegistration.findUnique({
    where: {
      assetId: asset.id,
    },
    select: {
      id: true,
      installationJob: {
        select: {
          id: true,
        },
      },
    },
  });

  const registrationStatus = existingRegistration?.installationJob
    ? "job_created"
    : "registered";

  const saleRegistration = existingRegistration
    ? await tx.saleRegistration.update({
        where: {
          id: existingRegistration.id,
        },
        data: {
          salesLineId: serializedSalesLine.id,
          channel: "erp_seeded",
          distributorName:
            mappedDistributor?.name ?? input.row.distributorName ?? null,
          status: registrationStatus,
          metadata: {
            distributorCode: input.row.distributorCode,
            sourceRecordKey,
            source: "sap_serialized_dispatch",
          } as Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      })
    : await tx.saleRegistration.create({
        data: {
          assetId: asset.id,
          organizationId: input.organizationId,
          salesLineId: serializedSalesLine.id,
          channel: "erp_seeded",
          distributorName:
            mappedDistributor?.name ?? input.row.distributorName ?? null,
          status: registrationStatus,
          metadata: {
            distributorCode: input.row.distributorCode,
            sourceRecordKey,
            source: "sap_serialized_dispatch",
          } as Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      });

  if (
    asset.lifecycleState === "generated" ||
    asset.lifecycleState === "packed"
  ) {
    await tx.assetIdentity.update({
      where: {
        id: asset.id,
      },
      data: {
        lifecycleState: saleRegistrationLifecycleState(),
      },
    });
  }

  await tx.erpSerializedDispatchRecord.update({
    where: {
      id: erpRecord.id,
    },
    data: {
      serializedSalesLineId: serializedSalesLine.id,
      status: "applied",
    },
  });

  return {
    erpSerializedDispatchRecordId: erpRecord.id,
    serializedSalesLineId: serializedSalesLine.id,
    saleRegistrationId: saleRegistration.id,
    assetId: asset.id,
    status,
  };
}

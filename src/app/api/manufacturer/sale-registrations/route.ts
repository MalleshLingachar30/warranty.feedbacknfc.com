import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  buildSerializedSalesLineSourceKey,
  parseOptionalDate,
  parseOptionalString,
  saleRegistrationLifecycleState,
} from "@/lib/installation-workflow";
import {
  saleRegistrationSelect,
  serializeSaleRegistrationRow,
} from "@/lib/installation-workflow-view";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  requireManufacturerContext,
} from "../_utils";

type SaleRegistrationPayload = {
  assetLookupCode?: unknown;
  channel?: unknown;
  purchaseDate?: unknown;
  dealerName?: unknown;
  distributorName?: unknown;
  salesLine?: {
    sourceDocumentNumber?: unknown;
    sourceLineNumber?: unknown;
    itemCode?: unknown;
    itemDescription?: unknown;
    transactionDate?: unknown;
    warehouseCode?: unknown;
    channelCode?: unknown;
    sourceSystem?: unknown;
  };
};

function parseChannel(value: unknown) {
  switch (value) {
    case "carton_scan":
    case "manual_admin":
    case "erp_seeded":
    case "salesman_assisted":
      return value;
    default:
      return "manual_admin";
  }
}

function asSalesLinePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as NonNullable<SaleRegistrationPayload["salesLine"]>;
}

async function resolveRegistrationAsset(
  organizationId: string,
  lookupCode: string,
) {
  return db.assetIdentity.findFirst({
    where: {
      organizationId,
      productClass: "main_product",
      OR: [
        {
          publicCode: lookupCode,
        },
        {
          serialNumber: lookupCode,
        },
        {
          tags: {
            some: {
              publicCode: lookupCode,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      publicCode: true,
      serialNumber: true,
      lifecycleState: true,
      productModel: {
        select: {
          name: true,
          activationMode: true,
          installationRequired: true,
        },
      },
    },
  });
}

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();

    const registrations = await db.saleRegistration.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        registeredAt: "desc",
      },
      select: saleRegistrationSelect,
      take: 200,
    });

    return NextResponse.json({
      registrations: registrations.map(serializeSaleRegistrationRow),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<SaleRegistrationPayload>(await request.json());

    const assetLookupCode = parseOptionalString(body.assetLookupCode);
    if (!assetLookupCode) {
      throw new ApiError("Asset code, tag code, or serial number is required.");
    }

    const asset = await resolveRegistrationAsset(
      organizationId,
      assetLookupCode,
    );
    if (!asset) {
      throw new ApiError("No matching serialized asset was found.", 404);
    }

    if (
      asset.productModel.activationMode !== "installation_driven" ||
      !asset.productModel.installationRequired
    ) {
      throw new ApiError(
        "Sale registration is only available for installation-driven main products.",
      );
    }

    const assetSerialNumber = asset.serialNumber;

    if (!assetSerialNumber) {
      throw new ApiError(
        "This asset is missing a serial number and cannot be tied to a serialized sales line.",
      );
    }

    const salesLinePayload = asSalesLinePayload(body.salesLine);
    const sourceDocumentNumber = parseOptionalString(
      salesLinePayload.sourceDocumentNumber,
    );
    const sourceLineNumber = parseOptionalString(
      salesLinePayload.sourceLineNumber,
    );
    const itemCode = parseOptionalString(salesLinePayload.itemCode);
    const itemDescription = parseOptionalString(
      salesLinePayload.itemDescription,
    );
    const transactionDate = parseOptionalDate(salesLinePayload.transactionDate);
    const warehouseCode = parseOptionalString(salesLinePayload.warehouseCode);
    const channelCode = parseOptionalString(salesLinePayload.channelCode);
    const sourceSystem = parseOptionalString(salesLinePayload.sourceSystem);
    const sourceRecordKey = buildSerializedSalesLineSourceKey({
      sourceDocumentNumber,
      sourceLineNumber,
      serialNumber: assetSerialNumber,
    });
    const purchaseDate = parseOptionalDate(body.purchaseDate);
    const dealerName = parseOptionalString(body.dealerName);
    const distributorName = parseOptionalString(body.distributorName);
    const channel = parseChannel(body.channel);

    const registration = await db.$transaction(async (tx) => {
      const salesLine = await tx.serializedSalesLine.upsert({
        where: {
          assetId: asset.id,
        },
        update: {
          sourceDocumentNumber,
          sourceLineNumber,
          sourceRecordKey,
          itemCode,
          itemDescription,
          serialNumber: assetSerialNumber,
          channelCode,
          dealerName,
          distributorName,
          warehouseCode,
          transactionDate,
          sourceSystem,
          metadata: {
            registrationLookupCode: assetLookupCode,
          } satisfies Prisma.InputJsonValue,
        },
        create: {
          organizationId,
          assetId: asset.id,
          sourceDocumentNumber,
          sourceLineNumber,
          sourceRecordKey,
          itemCode,
          itemDescription,
          serialNumber: assetSerialNumber,
          channelCode,
          dealerName,
          distributorName,
          warehouseCode,
          transactionDate,
          sourceSystem,
          metadata: {
            registrationLookupCode: assetLookupCode,
          } satisfies Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      });

      const existing = await tx.saleRegistration.findUnique({
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

      const status = existing?.installationJob ? "job_created" : "registered";

      if (!existing?.installationJob) {
        await tx.assetIdentity.update({
          where: {
            id: asset.id,
          },
          data: {
            lifecycleState: saleRegistrationLifecycleState(),
          },
        });
      }

      if (existing) {
        return tx.saleRegistration.update({
          where: {
            id: existing.id,
          },
          data: {
            salesLineId: salesLine.id,
            channel,
            dealerName,
            distributorName,
            purchaseDate,
            status,
            metadata: {
              assetLookupCode,
            } satisfies Prisma.InputJsonValue,
          },
          select: saleRegistrationSelect,
        });
      }

      return tx.saleRegistration.create({
        data: {
          assetId: asset.id,
          organizationId,
          salesLineId: salesLine.id,
          channel,
          dealerName,
          distributorName,
          purchaseDate,
          status,
          metadata: {
            assetLookupCode,
          } satisfies Prisma.InputJsonValue,
        },
        select: saleRegistrationSelect,
      });
    });

    return NextResponse.json({
      registration: serializeSaleRegistrationRow(registration),
    });
  } catch (error) {
    return jsonError(error);
  }
}

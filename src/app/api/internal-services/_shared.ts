import {
  InternalServiceInitiationSource,
  InternalServicePriority,
  InternalServiceType,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  findOpenInternalServiceOrderByControllingTag,
  generateInternalServiceOrderNumber,
  resolveInternalServiceAssetByReference,
  resolveInternalServiceAssetContextByReference,
} from "@/lib/internal-services";

type GenericRecord = Record<string, unknown>;

export type InternalServiceCreatePayload = {
  assetReference?: unknown;
  serviceCenterId?: unknown;
  initiationSource?: unknown;
  serviceType?: unknown;
  priority?: unknown;
  reportedFault?: unknown;
  inwardConditionNotes?: unknown;
  accessoriesReceived?: unknown;
};

export type NormalizedInternalServiceCreateInput = {
  assetReference: string;
  serviceCenterId: string;
  initiationSource: InternalServiceInitiationSource;
  serviceType: InternalServiceType;
  priority: InternalServicePriority;
  reportedFault: string | null;
  inwardConditionNotes: string | null;
  accessoriesReceived: string[];
};

export function asOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeInternalServiceCreateInput(
  body: InternalServiceCreatePayload,
) {
  const assetReference = asOptionalString(body.assetReference) ?? "";
  const serviceCenterId = asOptionalString(body.serviceCenterId) ?? "";
  const initiationSource = asOptionalString(body.initiationSource) ?? "manual_admin";
  const serviceType = asOptionalString(body.serviceType) ?? "depot_repair";
  const priority = asOptionalString(body.priority) ?? "medium";

  if (!assetReference) {
    throw new Error("Asset code, tag code, or serial number is required.");
  }

  if (!serviceCenterId) {
    throw new Error("A service center / depot selection is required.");
  }

  if (!(initiationSource in InternalServiceInitiationSource)) {
    throw new Error("Unsupported initiation source.");
  }

  if (!(serviceType in InternalServiceType)) {
    throw new Error("Unsupported internal service type.");
  }

  if (!(priority in InternalServicePriority)) {
    throw new Error("Unsupported internal service priority.");
  }

  return {
    assetReference,
    serviceCenterId,
    initiationSource: initiationSource as InternalServiceInitiationSource,
    serviceType: serviceType as InternalServiceType,
    priority: priority as InternalServicePriority,
    reportedFault: asOptionalString(body.reportedFault),
    inwardConditionNotes: asOptionalString(body.inwardConditionNotes),
    accessoriesReceived: parseStringArray(body.accessoriesReceived),
  } satisfies NormalizedInternalServiceCreateInput;
}

export async function createInternalServiceOrder(input: {
  manufacturerOrgId: string;
  serviceCenterId: string;
  requestedByUserId: string;
  receivedByUserId: string;
  normalized: NormalizedInternalServiceCreateInput;
  resolvedAsset?: {
    id: string;
    publicCode: string;
    serialNumber: string | null;
    organizationId: string;
    lifecycleState: string;
    productModel: {
      id: string;
      name: string;
      modelNumber: string | null;
    };
  } | null;
  resolvedAssetContext?: Awaited<
    ReturnType<typeof resolveInternalServiceAssetContextByReference>
  >;
}) {
  return db.$transaction(async (tx) => {
    const resolvedContext =
      input.resolvedAssetContext ??
      (input.resolvedAsset
        ? {
            asset: input.resolvedAsset,
            matchedTag: null,
            controllingTag: null,
            referenceSource: "asset_code" as const,
            controllingTagSource: "dashboard_v1" as const,
            controllingTagResolvedAt: null,
          }
        : await resolveInternalServiceAssetContextByReference(
            tx,
            input.normalized.assetReference,
            {
              manufacturerOrgId: input.manufacturerOrgId,
            },
          ));

    const asset =
      input.resolvedAsset ??
      resolvedContext?.asset ??
      (await resolveInternalServiceAssetByReference(
        tx,
        input.normalized.assetReference,
        {
          manufacturerOrgId: input.manufacturerOrgId,
        },
      ));

    if (!asset) {
      throw new Error("No serialized asset or tag matched the provided reference.");
    }

    if (resolvedContext?.controllingTag?.id) {
      const openOrder = await findOpenInternalServiceOrderByControllingTag(
        tx,
        resolvedContext.controllingTag.id,
      );

      if (openOrder) {
        throw new Error(
          `An active internal-service order already exists for this sticker identity (${openOrder.orderNumber}). Open that order instead of creating a duplicate inward.`,
        );
      }
    }

    const orderNumber = await generateInternalServiceOrderNumber(tx);
    const receivedAt = new Date();
    const inwardCaptureMode =
      resolvedContext?.controllingTagSource &&
      resolvedContext.controllingTagSource !== "dashboard_v1"
        ? "module_v2_sticker_led"
        : "module_v1";

    const order = await tx.internalServiceOrder.create({
      data: {
        orderNumber,
        assetId: asset.id,
        controllingTagId: resolvedContext?.controllingTag?.id ?? null,
        controllingTagSource: resolvedContext?.controllingTagSource ?? "dashboard_v1",
        manufacturerOrgId: input.manufacturerOrgId,
        serviceCenterId: input.serviceCenterId,
        requestedByUserId: input.requestedByUserId,
        receivedByUserId: input.receivedByUserId,
        initiationSource: input.normalized.initiationSource,
        serviceType: input.normalized.serviceType,
        priority: input.normalized.priority,
        status: "inward_received",
        reportedFault: input.normalized.reportedFault,
        inwardConditionNotes: input.normalized.inwardConditionNotes,
        accessoriesReceived: input.normalized.accessoriesReceived,
        receivedAt,
        controllingTagResolvedAt: resolvedContext?.controllingTagResolvedAt ?? null,
        metadata: {
          assetReference: input.normalized.assetReference,
          inwardCaptureMode,
          controllingTagCode: resolvedContext?.controllingTag?.publicCode ?? null,
          controllingTagReferenceSource: resolvedContext?.referenceSource ?? null,
        },
      },
      select: {
        id: true,
        orderNumber: true,
      },
    });

    await tx.assetIdentity.update({
      where: {
        id: asset.id,
      },
      data: {
        lifecycleState: "inward_received",
      },
    });

    await tx.internalServiceTimeline.create({
      data: {
        internalServiceOrderId: order.id,
        eventType: "inward_received",
        eventDescription:
          input.normalized.reportedFault ??
          "Internal service inward receipt captured.",
        actorUserId: input.receivedByUserId,
        actorRole: "internal_service_operator",
        actorName: "Internal Services",
        metadata: {
          accessoriesReceived: input.normalized.accessoriesReceived,
          assetReference: input.normalized.assetReference,
          controllingTagCode: resolvedContext?.controllingTag?.publicCode ?? null,
          controllingTagSource: resolvedContext?.controllingTagSource ?? "dashboard_v1",
        },
      },
    });

    return order;
  });
}

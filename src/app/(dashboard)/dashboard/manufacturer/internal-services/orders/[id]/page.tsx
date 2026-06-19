import { notFound } from "next/navigation";

import { InternalServiceOrderDetailView } from "@/components/internal-services/order-detail-view";
import { db } from "@/lib/db";
import { isInternalServiceControllingTagReady } from "@/lib/internal-services";

import { resolveManufacturerPageContext } from "../../../_lib/server-context";

interface ManufacturerInternalServiceOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

function metadataString(
  metadata: unknown,
  key: string,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function metadataBoolean(
  metadata: unknown,
  key: string,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as Record<string, unknown>)[key] === true;
}

export default async function ManufacturerInternalServiceOrderDetailPage({
  params,
}: ManufacturerInternalServiceOrderDetailPageProps) {
  const { organizationId } = await resolveManufacturerPageContext();
  const { id } = await params;

  if (!organizationId || !id) {
    notFound();
  }

  const order = await db.internalServiceOrder.findFirst({
    where: {
      id,
      manufacturerOrgId: organizationId,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      serviceType: true,
      priority: true,
      controllingTagId: true,
      controllingTagSource: true,
      controllingTagResolvedAt: true,
      initiationSource: true,
      finalDisposition: true,
      reportedFault: true,
      inwardConditionNotes: true,
      diagnosisNotes: true,
      resolutionNotes: true,
      accessoriesReceived: true,
      receivedAt: true,
      triagedAt: true,
      repairStartedAt: true,
      qcStartedAt: true,
      qcCompletedAt: true,
      completedAt: true,
      closedAt: true,
      isSaleableAfterService: true,
      manufacturerOrg: {
        select: {
          name: true,
        },
      },
      serviceCenter: {
        select: {
          name: true,
          city: true,
        },
      },
      assignedTechnician: {
        select: {
          name: true,
        },
      },
      requestedByUser: {
        select: {
          name: true,
        },
      },
      receivedByUser: {
        select: {
          name: true,
        },
      },
      asset: {
        select: {
          publicCode: true,
          serialNumber: true,
          productModel: {
            select: {
              name: true,
              modelNumber: true,
            },
          },
        },
      },
      controllingTag: {
        select: {
          publicCode: true,
        },
      },
      timelineEntries: {
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          eventType: true,
          eventDescription: true,
          actorName: true,
          actorRole: true,
          createdAt: true,
        },
      },
      partUsages: {
        orderBy: [{ linkedAt: "asc" }],
        select: {
          id: true,
          usageType: true,
          linkedAt: true,
          metadata: true,
          usedAsset: {
            select: {
              publicCode: true,
            },
          },
          usedTag: {
            select: {
              publicCode: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  return (
    <InternalServiceOrderDetailView
      backHref="/dashboard/manufacturer/internal-services/orders"
      backLabel="Back to internal orders"
      order={{
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        serviceType: order.serviceType,
        priority: order.priority,
        assignedTechnicianId: null,
        controllingTagCode: order.controllingTag?.publicCode ?? null,
        controllingTagSource: order.controllingTagSource,
        controllingTagResolvedAt: order.controllingTagResolvedAt?.toISOString() ?? null,
        controllingTagReady: isInternalServiceControllingTagReady({
          controllingTagId: order.controllingTagId,
          controllingTagSource: order.controllingTagSource,
          controllingTagResolvedAt: order.controllingTagResolvedAt,
        }),
        initiationSource: order.initiationSource,
        finalDisposition: order.finalDisposition,
        reportedFault: order.reportedFault,
        inwardConditionNotes: order.inwardConditionNotes,
        diagnosisNotes: order.diagnosisNotes,
        resolutionNotes: order.resolutionNotes,
        accessoriesReceived: Array.isArray(order.accessoriesReceived)
          ? order.accessoriesReceived.filter((value): value is string => typeof value === "string")
          : [],
        receivedAt: order.receivedAt?.toISOString() ?? null,
        triagedAt: order.triagedAt?.toISOString() ?? null,
        repairStartedAt: order.repairStartedAt?.toISOString() ?? null,
        qcStartedAt: order.qcStartedAt?.toISOString() ?? null,
        qcCompletedAt: order.qcCompletedAt?.toISOString() ?? null,
        completedAt: order.completedAt?.toISOString() ?? null,
        closedAt: order.closedAt?.toISOString() ?? null,
        isSaleableAfterService: order.isSaleableAfterService,
        manufacturerName: order.manufacturerOrg.name,
        serviceCenterName: order.serviceCenter.name,
        serviceCenterCity: order.serviceCenter.city,
        assignedTechnicianName: order.assignedTechnician?.name ?? null,
        requestedByName: order.requestedByUser.name,
        receivedByName: order.receivedByUser?.name ?? null,
        assetPublicCode: order.asset.publicCode,
        assetSerialNumber: order.asset.serialNumber,
        modelName: order.asset.productModel.name,
        modelNumber: order.asset.productModel.modelNumber,
        timelineEntries: order.timelineEntries.map((entry) => ({
          id: entry.id,
          eventType: entry.eventType,
          eventDescription: entry.eventDescription,
          actorName: entry.actorName,
          actorRole: entry.actorRole,
          createdAt: entry.createdAt.toISOString(),
        })),
        partUsages: order.partUsages.map((usage) => ({
          id: usage.id,
          usageType: usage.usageType,
          usedAssetCode: usage.usedAsset?.publicCode ?? null,
          usedTagCode: usage.usedTag?.publicCode ?? null,
          partName: metadataString(usage.metadata, "partName"),
          partNumber: metadataString(usage.metadata, "partNumber"),
          note: metadataString(usage.metadata, "note"),
          traced: metadataBoolean(usage.metadata, "traced"),
          linkedAt: usage.linkedAt.toISOString(),
        })),
      }}
    />
  );
}

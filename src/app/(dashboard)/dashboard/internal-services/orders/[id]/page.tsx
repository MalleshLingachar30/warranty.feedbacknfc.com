import { notFound } from "next/navigation";

import { InternalServiceOrderActionsClient } from "@/components/internal-services/order-actions-client";
import { InternalServiceOrderDetailView } from "@/components/internal-services/order-detail-view";
import { db } from "@/lib/db";

import { resolveServiceCenterPageContext } from "../../../_lib/service-center-context";

interface DepotInternalServiceOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DepotInternalServiceOrderDetailPage({
  params,
}: DepotInternalServiceOrderDetailPageProps) {
  const { organizationId } = await resolveServiceCenterPageContext();
  const { id } = await params;

  if (!organizationId || !id) {
    notFound();
  }

  const [order, technicians] = await Promise.all([
    db.internalServiceOrder.findFirst({
    where: {
      id,
      serviceCenter: {
        organizationId,
      },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      serviceType: true,
      priority: true,
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
          id: true,
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
    }),
    db.technician.findMany({
      where: {
        serviceCenter: {
          organizationId,
        },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <InternalServiceOrderActionsClient
        orderId={order.id}
        status={order.status}
        currentAssignedTechnicianId={order.assignedTechnician?.id ?? null}
        currentDiagnosisNotes={order.diagnosisNotes ?? ""}
        currentResolutionNotes={order.resolutionNotes ?? ""}
        currentReportedFault={order.reportedFault ?? ""}
        technicians={technicians}
      />
      <InternalServiceOrderDetailView
        backHref="/dashboard/internal-services/orders"
        backLabel="Back to internal orders"
        order={{
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          serviceType: order.serviceType,
          priority: order.priority,
          assignedTechnicianId: order.assignedTechnician?.id ?? null,
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
            linkedAt: usage.linkedAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}

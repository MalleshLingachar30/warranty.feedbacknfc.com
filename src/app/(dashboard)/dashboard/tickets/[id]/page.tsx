import Link from "next/link";
import { notFound } from "next/navigation";
import type { TicketStatus } from "@prisma/client";

import { PageHeader } from "@/components/dashboard/page-header";
import { TicketLogisticsClient } from "@/components/service-center/ticket-logistics-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";

import { resolveServiceCenterPageContext } from "../../_lib/service-center-context";

interface TicketLogisticsPageProps {
  params: Promise<{ id: string }>;
}

function statusLabel(status: TicketStatus | string) {
  return status.replace(/_/g, " ");
}

function formatDateTime(date: Date | null) {
  if (!date) {
    return "-";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ServiceCenterTicketLogisticsPage({
  params,
}: TicketLogisticsPageProps) {
  const { organizationId } = await resolveServiceCenterPageContext();
  const { id } = await params;

  if (!organizationId || !id) {
    notFound();
  }

  const [ticket, technicians] = await Promise.all([
    db.ticket.findFirst({
      where: {
        id,
        OR: [
          {
            assignedServiceCenter: {
              organizationId,
            },
          },
          {
            assignedTechnician: {
              serviceCenter: {
                organizationId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        issueCategory: true,
        issueDescription: true,
        reportedAt: true,
        assignedAt: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
        assignedTechnicianId: true,
        assignedTechnician: {
          select: {
            name: true,
          },
        },
        product: {
          select: {
            serialNumber: true,
            customerName: true,
            customerPhone: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
          },
        },
        partDispatches: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            dispatchNumber: true,
            status: true,
            notes: true,
            plannedAt: true,
            dispatchedAt: true,
            receivedByTechnicianAt: true,
            assignedTechnician: {
              select: {
                name: true,
              },
            },
            items: {
              orderBy: {
                createdAt: "asc",
              },
              select: {
                id: true,
                partName: true,
                partNumber: true,
                quantity: true,
                unitCost: true,
                status: true,
                spareAsset: {
                  select: {
                    publicCode: true,
                  },
                },
                spareTag: {
                  select: {
                    publicCode: true,
                  },
                },
              },
            },
          },
        },
        partReturns: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            returnNumber: true,
            status: true,
            partName: true,
            partNumber: true,
            quantity: true,
            collectionNotes: true,
            collectedAt: true,
            receivedAtServiceCenterAt: true,
            receivedByManufacturerAt: true,
            technician: {
              select: {
                name: true,
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
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  if (!ticket) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.ticketNumber}
        description="Operate traced spare dispatches and old-part returns for this service request."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge variant="outline" className="capitalize">
              {statusLabel(ticket.status)}
            </Badge>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/tickets">Back to queue</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Ticket Context</CardTitle>
            <CardDescription>{ticket.issueCategory ?? "General issue"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>{ticket.issueDescription}</p>
            <p>
              Product: {ticket.product.productModel.name}
              {ticket.product.productModel.modelNumber
                ? ` • ${ticket.product.productModel.modelNumber}`
                : ""}
            </p>
            <p>Serial: {ticket.product.serialNumber ?? "Not available"}</p>
            <p>Customer: {ticket.product.customerName ?? "Customer"}</p>
            <p>Phone: {ticket.product.customerPhone ?? "-"}</p>
            <p>Reported: {formatDateTime(ticket.reportedAt)}</p>
            <p>Assigned: {formatDateTime(ticket.assignedAt)}</p>
            <p>
              Technician: {ticket.assignedTechnician?.name ?? "Not assigned"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Execution Checkpoints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>Work started: {formatDateTime(ticket.technicianStartedAt)}</p>
            <p>Work completed: {formatDateTime(ticket.technicianCompletedAt)}</p>
            <p>
              Spare dispatches: {ticket.partDispatches.length} • Removed-part returns:{" "}
              {ticket.partReturns.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <TicketLogisticsClient
        ticketId={ticket.id}
        ticketStatus={ticket.status}
        currentAssignedTechnicianId={ticket.assignedTechnicianId}
        technicians={technicians}
        partDispatches={ticket.partDispatches.map((dispatch) => ({
          id: dispatch.id,
          dispatchNumber: dispatch.dispatchNumber,
          status: dispatch.status,
          notes: dispatch.notes,
          assignedTechnicianName: dispatch.assignedTechnician?.name ?? null,
          plannedAt: dispatch.plannedAt.toISOString(),
          dispatchedAt: dispatch.dispatchedAt?.toISOString() ?? null,
          receivedByTechnicianAt:
            dispatch.receivedByTechnicianAt?.toISOString() ?? null,
          items: dispatch.items.map((item) => ({
            id: item.id,
            partName: item.partName,
            partNumber: item.partNumber,
            quantity: Number(item.quantity.toString()),
            unitCost: item.unitCost ? Number(item.unitCost.toString()) : null,
            status: item.status,
            spareAssetCode: item.spareAsset?.publicCode ?? null,
            spareTagCode: item.spareTag?.publicCode ?? null,
          })),
        }))}
        partReturns={ticket.partReturns.map((partReturn) => ({
          id: partReturn.id,
          returnNumber: partReturn.returnNumber,
          status: partReturn.status,
          partName: partReturn.partName,
          partNumber: partReturn.partNumber,
          quantity: Number(partReturn.quantity.toString()),
          collectionNotes: partReturn.collectionNotes,
          technicianName: partReturn.technician?.name ?? null,
          collectedAt: partReturn.collectedAt?.toISOString() ?? null,
          receivedAtServiceCenterAt:
            partReturn.receivedAtServiceCenterAt?.toISOString() ?? null,
          receivedByManufacturerAt:
            partReturn.receivedByManufacturerAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}

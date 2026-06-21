import { Prisma, type TicketStatus } from "@prisma/client";
import { AlertTriangle, Clock3, TicketCheck, TimerReset } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { TicketQueueClient } from "@/components/manufacturer/ticket-queue-client";
import type {
  ServiceCenterOption,
  TechnicianOption,
} from "@/components/manufacturer/types";
import { PartReturnsClient } from "@/components/manufacturer/part-returns-client";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { getSlaIndicator, type SlaIndicatorState } from "@/lib/sla-config";

import { resolveManufacturerPageContext } from "../_lib/server-context";

const OPEN_STATUSES: TicketStatus[] = [
  "reported",
  "awaiting_technician_acceptance",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

function formatDateTime(date: Date) {
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

function slaIndicatorLabel(state: SlaIndicatorState) {
  switch (state) {
    case "on_track":
      return "On track";
    case "at_risk":
      return "At risk";
    case "breached":
      return "Breached";
    default:
      return "No SLA";
  }
}

type TicketMetricRow = {
  avgAssignmentLatencyHours: number | null;
  avgResolutionHours: number | null;
};

function metricValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type TicketQueueView = {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  issueCategory: string | null;
  issueSeverity: string;
  reportedAt: string;
  assignedAt: string | null;
  slaBreached: boolean;
  slaResponseDeadline: string | null;
  slaResolutionDeadline: string | null;
  assignedServiceCenter: {
    id: string;
    name: string;
  } | null;
  assignedTechnician: {
    id: string;
    name: string;
  } | null;
  product: {
    serialNumber: string | null;
    customerCity: string | null;
    productModel: {
      name: string;
      modelNumber: string | null;
    };
  };
  sla: {
    state: "on_track" | "at_risk" | "breached" | "none";
    label: string;
    deadline: string | null;
  };
};

export default async function ManufacturerTicketsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const [tickets, aggregate, metricRows, serviceCenters, technicians] = await Promise.all([
    db.ticket.findMany({
      where: {
        product: {
          organizationId,
        },
      },
      orderBy: {
        reportedAt: "desc",
      },
      take: 120,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        issueCategory: true,
        issueSeverity: true,
        reportedAt: true,
        assignedAt: true,
        slaBreached: true,
        slaResponseDeadline: true,
        slaResolutionDeadline: true,
        assignedServiceCenter: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedTechnician: {
          select: {
            id: true,
            name: true,
          },
        },
        product: {
          select: {
            serialNumber: true,
            customerCity: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
          },
        },
      },
    }),
    db.ticket.groupBy({
      by: ["status"],
      where: {
        product: {
          organizationId,
        },
      },
      _count: {
        _all: true,
      },
    }),
    db.$queryRaw<TicketMetricRow[]>(Prisma.sql`
      WITH latest_tickets AS (
        SELECT
          t.reported_at,
          t.assigned_at,
          t.technician_started_at,
          t.technician_completed_at
        FROM tickets t
        INNER JOIN products p ON p.id = t.product_id
        WHERE p.organization_id = ${organizationId}::uuid
        ORDER BY t.reported_at DESC
        LIMIT 120
      )
      SELECT
        AVG(
          CASE
            WHEN assigned_at IS NOT NULL AND assigned_at >= reported_at
            THEN EXTRACT(EPOCH FROM (assigned_at - reported_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgAssignmentLatencyHours",
        AVG(
          CASE
            WHEN technician_started_at IS NOT NULL
              AND technician_completed_at IS NOT NULL
              AND technician_completed_at >= technician_started_at
            THEN EXTRACT(EPOCH FROM (technician_completed_at - technician_started_at)) / 3600.0
            ELSE NULL
          END
        )::double precision AS "avgResolutionHours"
      FROM latest_tickets
    `),
    db.serviceCenter.findMany({
      where: {
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
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        city: true,
      },
    }),
    db.technician.findMany({
      where: {
        isAvailable: true,
        serviceCenter: {
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
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        serviceCenterId: true,
        serviceCenter: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const partReturns = await db.ticketPartReturn.findMany({
    where: {
      ticket: {
        product: {
          organizationId,
        },
      },
      status: {
        in: [
          "awaiting_collection",
          "collected_by_technician",
          "received_at_service_center",
          "received_by_manufacturer",
        ],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 120,
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
      closedAt: true,
      ticket: {
        select: {
          ticketNumber: true,
          product: {
            select: {
              serialNumber: true,
              productModel: {
                select: {
                  name: true,
                  modelNumber: true,
                },
              },
            },
          },
        },
      },
      serviceCenter: {
        select: {
          name: true,
        },
      },
      technician: {
        select: {
          name: true,
        },
      },
    },
  });

  const spareReturnObligations = await db.ticketPartDispatchItem.findMany({
    where: {
      dispatch: {
        ticket: {
          product: {
            organizationId,
          },
          technicianCompletedAt: {
            not: null,
          },
        },
      },
      status: {
        in: ["received_by_technician", "partially_reconciled"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 120,
    select: {
      id: true,
      status: true,
      partName: true,
      partNumber: true,
      quantity: true,
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
      dispatch: {
        select: {
          dispatchNumber: true,
          serviceCenter: {
            select: {
              name: true,
            },
          },
          assignedTechnician: {
            select: {
              name: true,
            },
          },
          ticket: {
            select: {
              ticketNumber: true,
              technicianCompletedAt: true,
              product: {
                select: {
                  serialNumber: true,
                  productModel: {
                    select: {
                      name: true,
                      modelNumber: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const openCount = aggregate
    .filter((entry) => OPEN_STATUSES.includes(entry.status))
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const escalatedCount = aggregate
    .filter(
      (entry) => entry.status === "escalated" || entry.status === "reopened",
    )
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const pendingConfirmationCount = aggregate
    .filter((entry) => entry.status === "pending_confirmation")
    .reduce((sum, entry) => sum + entry._count._all, 0);

  const avgAssignmentLatencyHours = metricValue(
    metricRows[0]?.avgAssignmentLatencyHours,
  );
  const avgResolutionHours = metricValue(metricRows[0]?.avgResolutionHours);

  const ticketRows: TicketQueueView[] = tickets.map((ticket) => {
    const indicator = getSlaIndicator({
      status: ticket.status,
      assignedAt: ticket.assignedAt,
      reportedAt: ticket.reportedAt,
      slaResponseDeadline: ticket.slaResponseDeadline,
      slaResolutionDeadline: ticket.slaResolutionDeadline,
      slaBreached: ticket.slaBreached,
    });
    const normalizedSlaState =
      indicator.state === "unknown" ? "none" : indicator.state;

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      issueCategory: ticket.issueCategory,
      issueSeverity: ticket.issueSeverity,
      reportedAt: ticket.reportedAt.toISOString(),
      assignedAt: ticket.assignedAt?.toISOString() ?? null,
      slaBreached: ticket.slaBreached,
      slaResponseDeadline: ticket.slaResponseDeadline?.toISOString() ?? null,
      slaResolutionDeadline: ticket.slaResolutionDeadline?.toISOString() ?? null,
      assignedServiceCenter: ticket.assignedServiceCenter,
      assignedTechnician: ticket.assignedTechnician,
      product: ticket.product,
      sla: {
        state: normalizedSlaState,
        label: slaIndicatorLabel(indicator.state),
        deadline: indicator.deadline?.toISOString() ?? null,
      },
    };
  });

  const serviceCenterOptions: ServiceCenterOption[] = serviceCenters.map((center) => ({
    id: center.id,
    name: center.name,
    city: center.city ?? "",
  }));

  const technicianOptions: TechnicianOption[] = technicians.map((technician) => ({
    id: technician.id,
    name: technician.name,
    serviceCenterId: technician.serviceCenterId,
    serviceCenterName: technician.serviceCenter.name,
  }));

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Monitor cross-center service requests, SLA drift, and assignment progression."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Open Tickets"
          value={openCount.toLocaleString()}
          description="All active ticket states"
          icon={TicketCheck}
        />
        <MetricCard
          title="Escalated/Reopened"
          value={escalatedCount.toLocaleString()}
          description="Requires immediate manager attention"
          icon={AlertTriangle}
        />
        <MetricCard
          title="Pending Confirmation"
          value={pendingConfirmationCount.toLocaleString()}
          description="Waiting for customer confirmation"
          icon={Clock3}
        />
        <MetricCard
          title="Average Resolution"
          value={formatHours(avgResolutionHours)}
          description={`Average assignment latency: ${formatHours(avgAssignmentLatencyHours)}`}
          icon={TimerReset}
        />
      </div>

      <TicketQueueClient
        initialTickets={ticketRows}
        serviceCenters={serviceCenterOptions}
        technicians={technicianOptions}
      />

      <PartReturnsClient
        rows={partReturns.map((partReturn) => ({
          id: partReturn.id,
          returnNumber: partReturn.returnNumber,
          status: partReturn.status,
          ticketNumber: partReturn.ticket.ticketNumber,
          serviceCenterName: partReturn.serviceCenter?.name ?? null,
          technicianName: partReturn.technician?.name ?? null,
          productModelName: partReturn.ticket.product.productModel.name,
          productModelNumber:
            partReturn.ticket.product.productModel.modelNumber ?? null,
          serialNumber: partReturn.ticket.product.serialNumber ?? null,
          partName: partReturn.partName,
          partNumber: partReturn.partNumber,
          quantity: Number(partReturn.quantity.toString()),
          collectionNotes: partReturn.collectionNotes,
          collectedAt: partReturn.collectedAt?.toISOString() ?? null,
          receivedAtServiceCenterAt:
            partReturn.receivedAtServiceCenterAt?.toISOString() ?? null,
          receivedByManufacturerAt:
            partReturn.receivedByManufacturerAt?.toISOString() ?? null,
          closedAt: partReturn.closedAt?.toISOString() ?? null,
        }))}
      />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Unused Spare Return Obligations</CardTitle>
          <CardDescription>
            Dispatched traced spares still in technician custody after service completion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dispatch / Ticket</TableHead>
                <TableHead>Spare</TableHead>
                <TableHead>Service Center</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spareReturnObligations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No unused traced spare obligations are pending.
                  </TableCell>
                </TableRow>
              ) : (
                spareReturnObligations.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="space-y-0.5">
                        <p>{item.dispatch.dispatchNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.dispatch.ticket.ticketNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.dispatch.ticket.product.productModel.name}
                          {item.dispatch.ticket.product.productModel.modelNumber
                            ? ` • ${item.dispatch.ticket.product.productModel.modelNumber}`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.dispatch.ticket.product.serialNumber ?? "Serial unavailable"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{item.partName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.partNumber ?? "No part number"} • Qty {Number(item.quantity)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.spareAsset?.publicCode ?? "No asset code"}
                          {item.spareTag?.publicCode
                            ? ` • ${item.spareTag.publicCode}`
                            : ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{item.dispatch.serviceCenter.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.dispatch.assignedTechnician?.name ?? "Technician unavailable"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {item.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.dispatch.ticket.technicianCompletedAt
                        ? formatDateTime(item.dispatch.ticket.technicianCompletedAt)
                        : "Not recorded"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

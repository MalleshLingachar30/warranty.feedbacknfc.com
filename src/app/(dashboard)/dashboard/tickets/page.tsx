import { AlertTriangle, Clock3, TicketCheck, TimerReset } from "lucide-react";
import { type TicketStatus } from "@prisma/client";

import { MetricCard } from "@/components/dashboard/metric-card";
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

import { resolveServiceCenterPageContext } from "../_lib/service-center-context";

const OPEN_STATUSES: TicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

function statusLabel(status: TicketStatus) {
  return status.replace(/_/g, " ");
}

function statusClass(status: TicketStatus) {
  switch (status) {
    case "reported":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "assigned":
    case "technician_enroute":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "work_in_progress":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "pending_confirmation":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "resolved":
    case "closed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "reopened":
    case "escalated":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

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

function slaIndicatorClass(state: SlaIndicatorState) {
  switch (state) {
    case "on_track":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "at_risk":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "breached":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
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

export default async function ServiceCenterTicketsPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [tickets, aggregate] = await Promise.all([
    db.ticket.findMany({
      where: {
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
      orderBy: {
        reportedAt: "desc",
      },
      take: 150,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        issueCategory: true,
        issueSeverity: true,
        reportedAt: true,
        assignedAt: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
        slaBreached: true,
        slaResponseDeadline: true,
        slaResolutionDeadline: true,
        product: {
          select: {
            customerName: true,
            customerPhone: true,
            serialNumber: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
          },
        },
        assignedTechnician: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.ticket.groupBy({
      by: ["status"],
      where: {
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
      _count: {
        _all: true,
      },
    }),
  ]);

  const openCount = aggregate
    .filter((entry) => OPEN_STATUSES.includes(entry.status))
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const escalatedCount = aggregate
    .filter((entry) => entry.status === "escalated" || entry.status === "reopened")
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const pendingConfirmationCount = aggregate
    .filter((entry) => entry.status === "pending_confirmation")
    .reduce((sum, entry) => sum + entry._count._all, 0);

  const assignmentLatencies = tickets
    .filter((ticket) => ticket.assignedAt instanceof Date)
    .map((ticket) => {
      const reportedMs = ticket.reportedAt.getTime();
      const assignedMs = ticket.assignedAt!.getTime();
      return (assignedMs - reportedMs) / (1000 * 60 * 60);
    })
    .filter((hours) => Number.isFinite(hours) && hours >= 0);

  const avgAssignmentLatencyHours =
    assignmentLatencies.length > 0
      ? assignmentLatencies.reduce((sum, hours) => sum + hours, 0) /
        assignmentLatencies.length
      : 0;

  const completionDurations = tickets
    .filter(
      (ticket) =>
        ticket.technicianStartedAt instanceof Date &&
        ticket.technicianCompletedAt instanceof Date,
    )
    .map((ticket) => {
      const started = ticket.technicianStartedAt!.getTime();
      const completed = ticket.technicianCompletedAt!.getTime();
      return (completed - started) / (1000 * 60 * 60);
    })
    .filter((hours) => Number.isFinite(hours) && hours >= 0);

  const avgResolutionHours =
    completionDurations.length > 0
      ? completionDurations.reduce((sum, hours) => sum + hours, 0) /
        completionDurations.length
      : 0;

  const breachedCount = tickets.filter((ticket) => ticket.slaBreached).length;

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Monitor assignments, SLA drift, and live job execution for your service network."
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
          description="Needs manager intervention"
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
          description={`Avg assignment latency: ${formatHours(avgAssignmentLatencyHours)}`}
          icon={TimerReset}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Service Queue</CardTitle>
          <CardDescription>
            Latest tickets assigned to this service-center organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No tickets are currently assigned to this service-center
                    organization.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-medium">
                      {ticket.ticketNumber}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{ticket.product.productModel.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.product.productModel.modelNumber
                            ? `${ticket.product.productModel.modelNumber} • `
                            : ""}
                          {ticket.product.serialNumber ?? "Serial unavailable"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{ticket.product.customerName ?? "Customer"}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.product.customerPhone ?? "-"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{ticket.issueCategory ?? "General issue"}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {ticket.issueSeverity}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${statusClass(ticket.status)}`}
                      >
                        {statusLabel(ticket.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{ticket.assignedTechnician?.name ?? "-"}</TableCell>
                    <TableCell>{formatDateTime(ticket.reportedAt)}</TableCell>
                    <TableCell>
                      {(() => {
                        const indicator = getSlaIndicator({
                          status: ticket.status,
                          assignedAt: ticket.assignedAt,
                          reportedAt: ticket.reportedAt,
                          slaResponseDeadline: ticket.slaResponseDeadline,
                          slaResolutionDeadline: ticket.slaResolutionDeadline,
                          slaBreached: ticket.slaBreached,
                        });

                        return (
                          <div className="space-y-1">
                            <Badge
                              variant="outline"
                              className={slaIndicatorClass(indicator.state)}
                            >
                              {slaIndicatorLabel(indicator.state)}
                            </Badge>
                            {indicator.deadline ? (
                              <p className="text-xs text-muted-foreground">
                                Due {formatDateTime(indicator.deadline)}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">-</p>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <p className="mt-3 text-xs text-muted-foreground">
            SLA breached in queue: {breachedCount.toLocaleString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import {
  BarChart3,
  MapPinned,
  ShieldAlert,
  Wrench,
} from "lucide-react";
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

import { resolveManufacturerPageContext } from "../_lib/server-context";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

function computeResolutionHours(
  startedAt: Date | null,
  completedAt: Date | null,
): number | null {
  if (!startedAt || !completedAt) {
    return null;
  }

  const diff = (completedAt.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(diff) || diff < 0) {
    return null;
  }

  return diff;
}

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeActivationSource(metadata: unknown) {
  const source = isRecord(metadata) ? metadata : {};
  const activationSource =
    typeof source.activationSource === "string"
      ? source.activationSource.trim().toLowerCase()
      : "";

  if (activationSource === "qr" || activationSource === "nfc") {
    return activationSource;
  }

  return "unknown";
}

export default async function ManufacturerAnalyticsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No manufacturer organization is linked to this account.
      </div>
    );
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [modelRows, ticketRows, activatedProductRows, stickerScanTop] = await Promise.all([
    db.productModel.findMany({
      where: {
        organizationId,
      },
      select: {
        id: true,
        name: true,
        modelNumber: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    db.ticket.findMany({
      where: {
        product: {
          organizationId,
        },
      },
      select: {
        id: true,
        status: true,
        issueCategory: true,
        slaBreached: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
        assignedTechnician: {
          select: {
            id: true,
            name: true,
          },
        },
        product: {
          select: {
            customerCity: true,
            productModel: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    db.product.findMany({
      where: {
        organizationId,
        warrantyStatus: {
          not: "pending_activation",
        },
      },
      select: {
        id: true,
        metadata: true,
      },
    }),
    db.stickerScanEvent
      .groupBy({
        by: ["stickerNumber"],
        where: {
          organizationId,
          scannedAt: {
            gte: thirtyDaysAgo,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 10,
      })
      .catch((error) => {
        console.error("Sticker scan analytics query failed", error);
        return [];
      }),
  ]);

  const totalTickets = ticketRows.length;
  const resolvedLikeStatuses: TicketStatus[] = ["resolved", "closed"];
  const resolvedTickets = ticketRows.filter((ticket) =>
    resolvedLikeStatuses.includes(ticket.status),
  ).length;
  const slaBreachedCount = ticketRows.filter((ticket) => ticket.slaBreached).length;
  const slaBreachRate =
    totalTickets > 0 ? (slaBreachedCount / totalTickets) * 100 : 0;

  const resolutionHours = ticketRows
    .map((ticket) =>
      computeResolutionHours(
        ticket.technicianStartedAt,
        ticket.technicianCompletedAt,
      ),
    )
    .filter((value): value is number => typeof value === "number");

  const avgResolutionHours =
    resolutionHours.length > 0
      ? resolutionHours.reduce((sum, value) => sum + value, 0) /
        resolutionHours.length
      : 0;

  const reliabilityByModel = modelRows
    .map((model) => {
      const ticketsForModel = ticketRows.filter(
        (ticket) => ticket.product.productModel.id === model.id,
      ).length;
      const unitCount = model._count.products;
      const failureRate = unitCount > 0 ? (ticketsForModel / unitCount) * 100 : 0;

      return {
        id: model.id,
        model: model.name,
        modelNumber: model.modelNumber ?? "-",
        units: unitCount,
        incidents: ticketsForModel,
        failureRate,
      };
    })
    .sort((left, right) => right.failureRate - left.failureRate);

  const issueMap = new Map<string, number>();
  for (const ticket of ticketRows) {
    const issue = (ticket.issueCategory ?? "General issue").trim();
    issueMap.set(issue, (issueMap.get(issue) ?? 0) + 1);
  }

  const commonIssues = [...issueMap.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);

  const regionalMap = new Map<
    string,
    { tickets: number; resolved: number; hours: number[] }
  >();

  for (const ticket of ticketRows) {
    const city = ticket.product.customerCity ?? "Unknown";
    const current = regionalMap.get(city) ?? {
      tickets: 0,
      resolved: 0,
      hours: [],
    };

    current.tickets += 1;

    if (resolvedLikeStatuses.includes(ticket.status)) {
      current.resolved += 1;
    }

    const hours = computeResolutionHours(
      ticket.technicianStartedAt,
      ticket.technicianCompletedAt,
    );
    if (typeof hours === "number") {
      current.hours.push(hours);
    }

    regionalMap.set(city, current);
  }

  const regionalPerformance = [...regionalMap.entries()]
    .map(([city, row]) => ({
      city,
      tickets: row.tickets,
      resolved: row.resolved,
      resolutionRate: row.tickets > 0 ? (row.resolved / row.tickets) * 100 : 0,
      avgResolutionHours:
        row.hours.length > 0
          ? row.hours.reduce((sum, value) => sum + value, 0) / row.hours.length
          : 0,
    }))
    .sort((left, right) => right.tickets - left.tickets);

  const technicianMap = new Map<
    string,
    { name: string; tickets: number; resolved: number; hours: number[] }
  >();

  for (const ticket of ticketRows) {
    if (!ticket.assignedTechnician?.id) {
      continue;
    }

    const technicianId = ticket.assignedTechnician.id;
    const current = technicianMap.get(technicianId) ?? {
      name: ticket.assignedTechnician.name,
      tickets: 0,
      resolved: 0,
      hours: [],
    };

    current.tickets += 1;
    if (resolvedLikeStatuses.includes(ticket.status)) {
      current.resolved += 1;
    }

    const hours = computeResolutionHours(
      ticket.technicianStartedAt,
      ticket.technicianCompletedAt,
    );
    if (typeof hours === "number") {
      current.hours.push(hours);
    }

    technicianMap.set(technicianId, current);
  }

  const technicianPerformance = [...technicianMap.entries()]
    .map(([id, row]) => ({
      id,
      name: row.name,
      tickets: row.tickets,
      resolved: row.resolved,
      resolutionRate: row.tickets > 0 ? (row.resolved / row.tickets) * 100 : 0,
      avgResolutionHours:
        row.hours.length > 0
          ? row.hours.reduce((sum, value) => sum + value, 0) / row.hours.length
      : 0,
    }))
    .sort((left, right) => right.tickets - left.tickets);

  const activationCounts = {
    qr: 0,
    nfc: 0,
    unknown: 0,
  };

  for (const product of activatedProductRows) {
    const source = normalizeActivationSource(product.metadata);
    activationCounts[source] += 1;
  }

  const totalActivations =
    activationCounts.qr + activationCounts.nfc + activationCounts.unknown;

  const topScannedStickers = stickerScanTop.map((row) => ({
    stickerNumber: row.stickerNumber,
    scans: row._count?.id ?? 0,
  }));

  const totalScansLast30Days = topScannedStickers.reduce(
    (sum, row) => sum + row.scans,
    0,
  );

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Reliability, issue concentration, regional trends, and technician throughput."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Tickets"
          value={totalTickets.toLocaleString()}
          description={`${resolvedTickets.toLocaleString()} resolved/closed`}
          icon={BarChart3}
        />
        <MetricCard
          title="Average Resolution"
          value={formatHours(avgResolutionHours)}
          description="From started to completed timestamps"
          icon={Wrench}
        />
        <MetricCard
          title="SLA Breach Rate"
          value={formatPercent(slaBreachRate)}
          description={`${slaBreachedCount.toLocaleString()} tickets breached`}
          icon={ShieldAlert}
        />
        <MetricCard
          title="Covered Regions"
          value={regionalPerformance.length.toLocaleString()}
          description="Cities with ticket activity"
          icon={MapPinned}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sticker Activation Sources</CardTitle>
            <CardDescription>
              Warranty activations captured from sticker links with{" "}
              <span className="font-mono text-xs">?src=qr</span> /{" "}
              <span className="font-mono text-xs">?src=nfc</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">QR</p>
              <p className="text-xl font-semibold">
                {activationCounts.qr.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(totalActivations > 0 ? (activationCounts.qr / totalActivations) * 100 : 0)}
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">NFC</p>
              <p className="text-xl font-semibold">
                {activationCounts.nfc.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(totalActivations > 0 ? (activationCounts.nfc / totalActivations) * 100 : 0)}
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">Unknown</p>
              <p className="text-xl font-semibold">
                {activationCounts.unknown.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(totalActivations > 0 ? (activationCounts.unknown / totalActivations) * 100 : 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Scanned Stickers</CardTitle>
            <CardDescription>
              Most frequently opened sticker URLs in the last 30 days (
              {totalScansLast30Days.toLocaleString()} total scans tracked).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sticker</TableHead>
                  <TableHead className="text-right">Scans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topScannedStickers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      No scan data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  topScannedStickers.map((row) => (
                    <TableRow key={row.stickerNumber}>
                      <TableCell>#{row.stickerNumber}</TableCell>
                      <TableCell className="text-right">
                        {row.scans.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product Reliability</CardTitle>
            <CardDescription>
              Incident rate by product model against installed base.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Incidents</TableHead>
                  <TableHead>Failure Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reliabilityByModel.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No product model data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  reliabilityByModel.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{row.model}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.modelNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.units.toLocaleString()}</TableCell>
                      <TableCell>{row.incidents.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatPercent(row.failureRate)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Common Issues</CardTitle>
            <CardDescription>
              Most frequently reported issue categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Incidents</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commonIssues.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No issue data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  commonIssues.map((row) => (
                    <TableRow key={row.issue}>
                      <TableCell>{row.issue}</TableCell>
                      <TableCell>{row.count.toLocaleString()}</TableCell>
                      <TableCell>
                        {formatPercent(
                          totalTickets > 0 ? (row.count / totalTickets) * 100 : 0,
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regional Performance</CardTitle>
            <CardDescription>
              Resolution throughput by customer region.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Resolution Rate</TableHead>
                  <TableHead>Avg Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regionalPerformance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No regional performance data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  regionalPerformance.map((row) => (
                    <TableRow key={row.city}>
                      <TableCell>{row.city}</TableCell>
                      <TableCell>{row.tickets.toLocaleString()}</TableCell>
                      <TableCell>{formatPercent(row.resolutionRate)}</TableCell>
                      <TableCell>{formatHours(row.avgResolutionHours)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technician Performance</CardTitle>
            <CardDescription>
              Assignment and completion throughput for active technicians.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Resolution Rate</TableHead>
                  <TableHead>Avg Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicianPerformance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No technician metrics available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  technicianPerformance.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.tickets.toLocaleString()}</TableCell>
                      <TableCell>{formatPercent(row.resolutionRate)}</TableCell>
                      <TableCell>{formatHours(row.avgResolutionHours)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

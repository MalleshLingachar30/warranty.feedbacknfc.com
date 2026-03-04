import { Gauge, Star, UserCheck, Users } from "lucide-react";

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

import {
  decimalToNumber,
  resolveServiceCenterPageContext,
} from "../_lib/service-center-context";

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

export default async function ServiceCenterTechniciansPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [technicians, resolvedTickets] = await Promise.all([
    db.technician.findMany({
      where: {
        serviceCenter: {
          organizationId,
        },
      },
      orderBy: [{ isAvailable: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        phone: true,
        skills: true,
        isAvailable: true,
        activeJobCount: true,
        maxConcurrentJobs: true,
        totalJobsCompleted: true,
        rating: true,
        serviceCenter: {
          select: {
            name: true,
            city: true,
          },
        },
      },
    }),
    db.ticket.findMany({
      where: {
        assignedTechnician: {
          serviceCenter: {
            organizationId,
          },
        },
        status: {
          in: ["resolved", "closed"],
        },
        technicianStartedAt: {
          not: null,
        },
        technicianCompletedAt: {
          not: null,
        },
      },
      select: {
        assignedTechnicianId: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
      },
    }),
  ]);

  const totalTechnicians = technicians.length;
  const availableTechnicians = technicians.filter(
    (technician) => technician.isAvailable,
  ).length;
  const activeJobs = technicians.reduce(
    (sum, technician) => sum + technician.activeJobCount,
    0,
  );
  const avgRating =
    totalTechnicians > 0
      ? technicians.reduce(
          (sum, technician) => sum + decimalToNumber(technician.rating),
          0,
        ) / totalTechnicians
      : 0;

  const avgHoursByTechnician = new Map<string, number>();
  const durationsByTechnician = new Map<string, number[]>();

  for (const ticket of resolvedTickets) {
    const technicianId = ticket.assignedTechnicianId;
    if (!technicianId) {
      continue;
    }

    const startedAt = ticket.technicianStartedAt?.getTime();
    const completedAt = ticket.technicianCompletedAt?.getTime();

    if (!startedAt || !completedAt || completedAt < startedAt) {
      continue;
    }

    const durationHours = (completedAt - startedAt) / (1000 * 60 * 60);

    const current = durationsByTechnician.get(technicianId) ?? [];
    current.push(durationHours);
    durationsByTechnician.set(technicianId, current);
  }

  for (const [technicianId, durations] of durationsByTechnician) {
    const avg =
      durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : 0;
    avgHoursByTechnician.set(technicianId, avg);
  }

  return (
    <div>
      <PageHeader
        title="Technicians"
        description="Track technician availability, workload, and service execution performance."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Technicians"
          value={totalTechnicians.toLocaleString()}
          description="Total technicians in this organization"
          icon={Users}
        />
        <MetricCard
          title="Available"
          value={availableTechnicians.toLocaleString()}
          description="Marked available for assignment"
          icon={UserCheck}
        />
        <MetricCard
          title="Active Jobs"
          value={activeJobs.toLocaleString()}
          description="Current jobs in progress"
          icon={Gauge}
        />
        <MetricCard
          title="Average Rating"
          value={avgRating.toFixed(2)}
          description="Combined field rating across technicians"
          icon={Star}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Technician Roster</CardTitle>
          <CardDescription>
            Performance and load distribution by technician.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Technician</TableHead>
                <TableHead>Service Center</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Load</TableHead>
                <TableHead>Completed Jobs</TableHead>
                <TableHead>Avg Resolution</TableHead>
                <TableHead>Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No technicians are registered for this service-center
                    organization.
                  </TableCell>
                </TableRow>
              ) : (
                technicians.map((technician) => {
                  const avgResolutionHours =
                    avgHoursByTechnician.get(technician.id) ?? 0;

                  return (
                    <TableRow key={technician.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium">{technician.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {technician.phone}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p>{technician.serviceCenter.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {technician.serviceCenter.city ?? "-"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {technician.isAvailable ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            Available
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-700"
                          >
                            Busy
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {technician.skills.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {technician.skills.slice(0, 3).map((skill) => (
                              <Badge key={skill} variant="secondary">
                                {skill}
                              </Badge>
                            ))}
                            {technician.skills.length > 3 ? (
                              <span className="text-xs text-muted-foreground">
                                +{technician.skills.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {technician.activeJobCount}/{technician.maxConcurrentJobs}
                      </TableCell>
                      <TableCell>
                        {technician.totalJobsCompleted.toLocaleString()}
                      </TableCell>
                      <TableCell>{formatHours(avgResolutionHours)}</TableCell>
                      <TableCell>
                        {decimalToNumber(technician.rating).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

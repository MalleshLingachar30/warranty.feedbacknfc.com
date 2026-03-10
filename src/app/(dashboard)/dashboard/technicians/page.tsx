import { Prisma } from "@prisma/client";
import { Gauge, Star, UserCheck, Users } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { SendInstallInviteButton } from "@/components/pwa/send-install-invite-button";
import { AddTechnicianDialog } from "@/components/service-center/add-technician-dialog";
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

type TechnicianResolutionRow = {
  technicianId: string;
  avgResolutionHours: number | null;
};

export default async function ServiceCenterTechniciansPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [technicians, resolutionRows, serviceCenters] = await Promise.all([
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
    db.$queryRaw<TechnicianResolutionRow[]>(Prisma.sql`
      SELECT
        t.assigned_technician_id AS "technicianId",
        AVG(
          EXTRACT(EPOCH FROM (t.technician_completed_at - t.technician_started_at)) / 3600.0
        )::double precision AS "avgResolutionHours"
      FROM tickets t
      INNER JOIN technicians tech ON tech.id = t.assigned_technician_id
      INNER JOIN service_centers sc ON sc.id = tech.service_center_id
      WHERE sc.organization_id = ${organizationId}::uuid
        AND t.status IN ('resolved', 'closed')
        AND t.technician_started_at IS NOT NULL
        AND t.technician_completed_at IS NOT NULL
        AND t.technician_completed_at >= t.technician_started_at
      GROUP BY t.assigned_technician_id
    `),
    db.serviceCenter.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        city: true,
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

  const avgHoursByTechnician = new Map(
    resolutionRows.map((row) => [
      row.technicianId,
      decimalToNumber(row.avgResolutionHours),
    ]),
  );

  return (
    <div>
      <PageHeader
        title="Technicians"
        description="Track technician availability, workload, and service execution performance."
        actions={
          serviceCenters.length > 0 ? (
            <AddTechnicianDialog serviceCenters={serviceCenters} />
          ) : null
        }
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground">
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
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {technician.activeJobCount}/
                        {technician.maxConcurrentJobs}
                      </TableCell>
                      <TableCell>
                        {technician.totalJobsCompleted.toLocaleString()}
                      </TableCell>
                      <TableCell>{formatHours(avgResolutionHours)}</TableCell>
                      <TableCell>
                        {decimalToNumber(technician.rating).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <SendInstallInviteButton
                          target="technician"
                          technicianId={technician.id}
                        />
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

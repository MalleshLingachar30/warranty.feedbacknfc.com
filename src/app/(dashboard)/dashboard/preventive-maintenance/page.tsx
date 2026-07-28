import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import type { PreventiveMaintenanceTechnicianOption } from "@/components/preventive-maintenance/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import {
  preventiveMaintenanceEventSelect,
  serializePreventiveMaintenanceEvent,
} from "@/lib/preventive-maintenance-api";

import { resolveFieldServicePageContext } from "../_lib/service-center-context";

const ServiceCenterPmQueue = dynamic(
  () =>
    import("@/components/preventive-maintenance/service-center-pm-queue").then(
      (mod) => mod.ServiceCenterPmQueue,
    ),
  {
    loading: () => <ClientPageLoading rows={8} />,
  },
);

export default async function ServiceCenterPreventiveMaintenancePage() {
  const { organizationId } = await resolveFieldServicePageContext();

  if (!organizationId) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-900">
            No service center linked
          </CardTitle>
          <CardDescription className="text-amber-800">
            This account is not linked to a service-center organization.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [events, technicians] = await Promise.all([
    db.preventiveMaintenanceEvent.findMany({
      where: {
        assignedServiceCenter: {
          organizationId,
        },
      },
      orderBy: [
        {
          scheduledFor: "asc",
        },
        {
          dueDate: "asc",
        },
        {
          eventNumber: "asc",
        },
      ],
      take: 200,
      select: preventiveMaintenanceEventSelect,
    }),
    db.technician.findMany({
      where: {
        serviceCenter: {
          organizationId,
        },
      },
      orderBy: [{ serviceCenterId: "asc" }, { name: "asc" }],
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

  return (
    <ServiceCenterPmQueue
      initialEvents={events.map((event) =>
        serializePreventiveMaintenanceEvent(event),
      )}
      technicians={technicians.map(
        (technician): PreventiveMaintenanceTechnicianOption => ({
          id: technician.id,
          name: technician.name,
          serviceCenterId: technician.serviceCenterId,
          serviceCenterName: technician.serviceCenter.name,
        }),
      )}
    />
  );
}

import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import type {
  PreventiveMaintenanceProductModelOption,
  PreventiveMaintenanceServiceCenterOption,
  PreventiveMaintenanceTechnicianOption,
} from "@/components/preventive-maintenance/types";
import { db } from "@/lib/db";
import {
  preventiveMaintenanceEventSelect,
  preventiveMaintenancePlanSelect,
  serializePreventiveMaintenanceEvent,
  serializePreventiveMaintenancePlan,
} from "@/lib/preventive-maintenance-api";

import { resolveManufacturerPageContext } from "../_lib/server-context";

const ManufacturerPmWorkbench = dynamic(
  () =>
    import("@/components/preventive-maintenance/manufacturer-pm-workbench").then(
      (mod) => mod.ManufacturerPmWorkbench,
    ),
  {
    loading: () => <ClientPageLoading rows={8} />,
  },
);

export default async function ManufacturerPreventiveMaintenancePage() {
  const { organizationId } = await resolveManufacturerPageContext();

  const [plans, events, productModels, serviceCenters, technicians] =
    organizationId
      ? await Promise.all([
          db.preventiveMaintenancePlan.findMany({
            where: {
              organizationId,
            },
            orderBy: [
              {
                productModel: {
                  name: "asc",
                },
              },
              {
                createdAt: "desc",
              },
            ],
            take: 200,
            select: preventiveMaintenancePlanSelect,
          }),
          db.preventiveMaintenanceEvent.findMany({
            where: {
              organizationId,
            },
            orderBy: [
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
          db.productModel.findMany({
            where: {
              organizationId,
            },
            orderBy: {
              name: "asc",
            },
            select: {
              id: true,
              name: true,
              modelNumber: true,
            },
          }),
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
            orderBy: {
              name: "asc",
            },
            select: {
              id: true,
              name: true,
              city: true,
            },
          }),
          db.technician.findMany({
            where: {
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
        ])
      : [[], [], [], [], []];

  return (
    <ManufacturerPmWorkbench
      initialPlans={plans.map(serializePreventiveMaintenancePlan)}
      initialEvents={events.map((event) =>
        serializePreventiveMaintenanceEvent(event),
      )}
      productModels={productModels.map(
        (model): PreventiveMaintenanceProductModelOption => ({
          id: model.id,
          name: model.name,
          modelNumber: model.modelNumber ?? "",
        }),
      )}
      serviceCenters={serviceCenters.map(
        (center): PreventiveMaintenanceServiceCenterOption => ({
          id: center.id,
          name: center.name,
          city: center.city,
        }),
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

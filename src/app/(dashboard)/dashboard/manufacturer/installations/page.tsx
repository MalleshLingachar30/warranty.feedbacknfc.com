import dynamic from "next/dynamic";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { db } from "@/lib/db";
import {
  installationJobSelect,
  serializeInstallationJobRow,
  serializeServiceCenterOption,
  serializeTechnicianOption,
} from "@/lib/installation-workflow-view";

import { resolveManufacturerPageContext } from "../_lib/server-context";

const InstallationJobsClient = dynamic(
  () =>
    import("@/components/manufacturer/installation-jobs-client").then(
      (mod) => mod.InstallationJobsClient,
    ),
  {
    loading: () => <ClientPageLoading rows={6} />,
  },
);

export default async function ManufacturerInstallationsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  const [jobs, serviceCenters, technicians] = organizationId
    ? await Promise.all([
        db.installationJob.findMany({
          where: {
            manufacturerOrgId: organizationId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 200,
          select: installationJobSelect,
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
    : [[], [], []];

  return (
    <InstallationJobsClient
      initialJobs={jobs.map(serializeInstallationJobRow)}
      serviceCenters={serviceCenters.map(serializeServiceCenterOption)}
      technicians={technicians.map((technician) =>
        serializeTechnicianOption({
          id: technician.id,
          name: technician.name,
          serviceCenterId: technician.serviceCenterId,
          serviceCenterName: technician.serviceCenter.name,
        }),
      )}
    />
  );
}

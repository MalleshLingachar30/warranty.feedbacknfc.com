import dynamic from "next/dynamic";
import { ClaimStatus } from "@prisma/client";

import { ClientPageLoading } from "@/components/dashboard/client-page-loading";
import { type ServiceCenterRow } from "@/components/manufacturer/types";
import { db } from "@/lib/db";
import { serviceCentersSeed } from "@/lib/mock/manufacturer-dashboard";

import {
  decimalToNumber,
  resolveManufacturerPageContext,
} from "../_lib/server-context";

const ServiceNetworkClient = dynamic(
  () =>
    import("@/components/manufacturer/service-network-client").then(
      (mod) => mod.ServiceNetworkClient,
    ),
  {
    loading: () => <ClientPageLoading rows={6} />,
  },
);

function mapSeedCenters(): ServiceCenterRow[] {
  return serviceCentersSeed.map((center) => ({
    id: center.id,
    name: center.name,
    city: center.city,
    supportedCategories: center.supportedCategories,
    rating: center.rating,
    totalJobsCompleted: center.totalJobsCompleted,
    technicians: center.technicians.map((technician) => ({
      id: technician.id,
      name: technician.name,
      skillset: technician.skillset,
      jobsCompleted: technician.jobsCompleted,
      rating: technician.firstTimeFixRate / 20,
    })),
    performance: {
      avgResolutionHours: center.performance.avgResolutionHours,
      claimAccuracy: center.performance.claimAccuracy,
      customerSatisfaction: center.performance.customerSatisfaction,
    },
  }));
}

function buildClaimStatsByOrganization(
  claimStats: Array<{
    serviceCenterOrgId: string;
    status: ClaimStatus;
    _count: {
      _all: number;
    };
  }>,
) {
  const map = new Map<string, { approved: number; rejected: number }>();

  for (const stat of claimStats) {
    const current = map.get(stat.serviceCenterOrgId) ?? {
      approved: 0,
      rejected: 0,
    };

    if (stat.status === "approved") {
      current.approved += stat._count._all;
    }

    if (stat.status === "rejected") {
      current.rejected += stat._count._all;
    }

    map.set(stat.serviceCenterOrgId, current);
  }

  return map;
}

export default async function ServiceNetworkPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  let centers: ServiceCenterRow[] = [];

  if (organizationId) {
    const [rows, claimStats] = await Promise.all([
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
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          city: true,
          supportedCategories: true,
          rating: true,
          totalJobsCompleted: true,
          averageResolutionHours: true,
          organizationId: true,
          technicians: {
            select: {
              id: true,
              name: true,
              skills: true,
              totalJobsCompleted: true,
              rating: true,
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      }),
      db.warrantyClaim.groupBy({
        by: ["serviceCenterOrgId", "status"],
        where: {
          manufacturerOrgId: organizationId,
          status: {
            in: ["approved", "rejected"],
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const statsByOrg = buildClaimStatsByOrganization(claimStats);

    centers = rows.map((center) => {
      const claimSummary = statsByOrg.get(center.organizationId) ?? {
        approved: 0,
        rejected: 0,
      };

      const totalReviewed = claimSummary.approved + claimSummary.rejected;
      const claimAccuracy =
        totalReviewed > 0
          ? Math.round((claimSummary.approved / totalReviewed) * 100)
          : 0;

      const rating = decimalToNumber(center.rating);

      return {
        id: center.id,
        name: center.name,
        city: center.city ?? "-",
        supportedCategories: center.supportedCategories,
        rating,
        totalJobsCompleted: center.totalJobsCompleted,
        technicians: center.technicians.map((technician) => ({
          id: technician.id,
          name: technician.name,
          skillset: technician.skills,
          jobsCompleted: technician.totalJobsCompleted,
          rating: decimalToNumber(technician.rating),
        })),
        performance: {
          avgResolutionHours: decimalToNumber(center.averageResolutionHours),
          claimAccuracy,
          customerSatisfaction: rating,
        },
      };
    });
  }

  if (centers.length === 0) {
    centers = mapSeedCenters();
  }

  return <ServiceNetworkClient initialCenters={centers} />;
}

import { NextResponse } from "next/server";
import { ClaimStatus, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import {
  ApiError,
  jsonError,
  parseJsonBody,
  parseStringArray,
  requireManufacturerContext,
} from "../_utils";

type ServiceCenterPayload = {
  name?: unknown;
  city?: unknown;
  state?: unknown;
  address?: unknown;
  pincode?: unknown;
  phone?: unknown;
  email?: unknown;
  supportedCategories?: unknown;
};

type ServiceCenterRow = {
  id: string;
  name: string;
  city: string;
  supportedCategories: string[];
  rating: number;
  totalJobsCompleted: number;
  technicians: Array<{
    id: string;
    name: string;
    skillset: string[];
    jobsCompleted: number;
    rating: number;
  }>;
  performance: {
    avgResolutionHours: number;
    claimAccuracy: number;
    customerSatisfaction: number;
  };
};

function toNumberValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      const numeric = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(numeric) ? numeric : 0;
    } catch {
      return 0;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mergeUnique(values: string[]) {
  return Array.from(new Set(values.filter((entry) => entry.trim().length > 0)));
}

function normalizeClaimStats(
  claimStats: Array<{
    serviceCenterOrgId: string;
    status: ClaimStatus;
    _count: {
      _all: number;
    };
  }>,
) {
  const statsByOrg = new Map<string, { approved: number; rejected: number }>();

  for (const entry of claimStats) {
    const current = statsByOrg.get(entry.serviceCenterOrgId) ?? {
      approved: 0,
      rejected: 0,
    };

    if (entry.status === "approved") {
      current.approved += entry._count._all;
    }

    if (entry.status === "rejected") {
      current.rejected += entry._count._all;
    }

    statsByOrg.set(entry.serviceCenterOrgId, current);
  }

  return statsByOrg;
}

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();

    const [centers, claimStats] = await Promise.all([
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

    const statsByOrg = normalizeClaimStats(claimStats);

    const rows: ServiceCenterRow[] = centers.map((center) => {
      const claimSummary = statsByOrg.get(center.organizationId) ?? {
        approved: 0,
        rejected: 0,
      };

      const totalReviewed = claimSummary.approved + claimSummary.rejected;
      const claimAccuracy =
        totalReviewed > 0
          ? Math.round((claimSummary.approved / totalReviewed) * 100)
          : 0;

      const avgRating = toNumberValue(center.rating);

      return {
        id: center.id,
        name: center.name,
        city: center.city ?? "-",
        supportedCategories: center.supportedCategories,
        rating: avgRating,
        totalJobsCompleted: center.totalJobsCompleted,
        technicians: center.technicians.map((technician) => ({
          id: technician.id,
          name: technician.name,
          skillset: technician.skills,
          jobsCompleted: technician.totalJobsCompleted,
          rating: toNumberValue(technician.rating),
        })),
        performance: {
          avgResolutionHours: toNumberValue(center.averageResolutionHours),
          claimAccuracy,
          customerSatisfaction: avgRating,
        },
      };
    });

    return NextResponse.json({ centers: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManufacturerContext();
    const body = parseJsonBody<ServiceCenterPayload>(await request.json());

    const name = asOptionalString(body.name) ?? "";
    const city = asOptionalString(body.city) ?? "";

    if (!name) {
      throw new ApiError("Service center name is required.", 400);
    }

    if (!city) {
      throw new ApiError("City is required.", 400);
    }

    const supportedCategories = parseStringArray(body.supportedCategories);
    const state = asOptionalString(body.state);
    const address = asOptionalString(body.address);
    const pincode = asOptionalString(body.pincode);
    const phone = asOptionalString(body.phone);
    const email = asOptionalString(body.email);

    const centerMatchFilters: Prisma.ServiceCenterWhereInput[] = [];
    if (email) {
      centerMatchFilters.push({
        email: {
          equals: email,
          mode: "insensitive",
        },
      });
    }

    centerMatchFilters.push({
      name: {
        equals: name,
        mode: "insensitive",
      },
      city: {
        equals: city,
        mode: "insensitive",
      },
    });

    const savedCenter = await db.$transaction(async (tx) => {
      const existing = await tx.serviceCenter.findFirst({
        where: {
          OR: centerMatchFilters,
        },
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          address: true,
          pincode: true,
          phone: true,
          email: true,
          supportedCategories: true,
          manufacturerAuthorizations: true,
          rating: true,
          totalJobsCompleted: true,
          averageResolutionHours: true,
          organizationId: true,
          organization: {
            select: {
              type: true,
            },
          },
        },
      });

      let serviceCenterOrgId: string;
      if (existing) {
        if (existing.organization.type === "service_center") {
          serviceCenterOrgId = existing.organizationId;
        } else {
          const createdOrg = await tx.organization.create({
            data: {
              name,
              type: "service_center",
              city,
              state,
              address,
              pincode,
              contactEmail: email,
              contactPhone: phone,
            },
            select: {
              id: true,
            },
          });

          serviceCenterOrgId = createdOrg.id;
        }

        return tx.serviceCenter.update({
          where: { id: existing.id },
          data: {
            organizationId: serviceCenterOrgId,
            name,
            city,
            state,
            address,
            pincode,
            phone,
            email,
            supportedCategories:
              supportedCategories.length > 0
                ? mergeUnique([
                    ...existing.supportedCategories,
                    ...supportedCategories,
                  ])
                : existing.supportedCategories,
            manufacturerAuthorizations: mergeUnique([
              ...existing.manufacturerAuthorizations,
              organizationId,
            ]),
          },
          select: {
            id: true,
            name: true,
            city: true,
            supportedCategories: true,
            rating: true,
            totalJobsCompleted: true,
            averageResolutionHours: true,
          },
        });
      }

      const createdOrg = await tx.organization.create({
        data: {
          name,
          type: "service_center",
          city,
          state,
          address,
          pincode,
          contactEmail: email,
          contactPhone: phone,
        },
        select: {
          id: true,
        },
      });

      return tx.serviceCenter.create({
        data: {
          organizationId: createdOrg.id,
          name,
          city,
          state,
          address,
          pincode,
          phone,
          email,
          supportedCategories,
          manufacturerAuthorizations: [organizationId],
        },
        select: {
          id: true,
          name: true,
          city: true,
          supportedCategories: true,
          rating: true,
          totalJobsCompleted: true,
          averageResolutionHours: true,
        },
      });
    });

    return NextResponse.json(
      {
        center: {
          id: savedCenter.id,
          name: savedCenter.name,
          city: savedCenter.city ?? "-",
          supportedCategories: savedCenter.supportedCategories,
          rating: toNumberValue(savedCenter.rating),
          totalJobsCompleted: savedCenter.totalJobsCompleted,
          technicians: [],
          performance: {
            avgResolutionHours: toNumberValue(savedCenter.averageResolutionHours),
            claimAccuracy: 0,
            customerSatisfaction: toNumberValue(savedCenter.rating),
          },
        } satisfies ServiceCenterRow,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

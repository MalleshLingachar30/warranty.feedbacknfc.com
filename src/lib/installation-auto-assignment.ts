import "server-only";

import { db } from "@/lib/db";
import type { InstallationJobStatus } from "@prisma/client";
import { installationJobLifecycleState } from "@/lib/installation-workflow";

const DEFAULT_MAX_RADIUS_KM = 50;
const DEFAULT_MAX_CONCURRENT_JOBS = 3;

type InstallationAssignmentCandidate = {
  technicianId: string;
  serviceCenterId: string;
  score: number;
  estimatedDistanceKm: number;
};

function normalizePincode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, "").trim();
  return normalized.length > 0 ? normalized : null;
}

function estimateDistanceKm(
  serviceCenterPincode: string | null | undefined,
  customerPincode: string | null | undefined,
): number {
  const center = normalizePincode(serviceCenterPincode);
  const customer = normalizePincode(customerPincode);

  if (!center || !customer) {
    return 40;
  }

  if (center === customer) {
    return 3;
  }

  if (center.slice(0, 5) === customer.slice(0, 5)) {
    return 10;
  }

  if (center.slice(0, 3) === customer.slice(0, 3)) {
    return 20;
  }

  return 75;
}

function normalizeCategoryKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  switch (normalized) {
    case "ventilator":
    case "medical_ventilator":
      return "medical_ventilator";
    case "air_conditioner":
    case "ac":
      return "ac";
    case "fridge":
    case "refrigerator":
      return "refrigerator";
    case "washingmachine":
    case "washing_machine":
      return "washing_machine";
    case "tv":
    case "television":
      return "television";
    case "water_heater":
    case "geyser":
      return "geyser";
    case "waterpurifier":
    case "water_purifier":
      return "water_purifier";
    default:
      return normalized;
  }
}

function hasCategorySupport(
  supportedCategories: string[],
  category: string,
): boolean {
  if (supportedCategories.length === 0) {
    return true;
  }

  const normalizedCategory = normalizeCategoryKey(category);

  return supportedCategories.some(
    (entry) => normalizeCategoryKey(entry) === normalizedCategory,
  );
}

function workloadScore(
  activeJobCount: number,
  maxConcurrentJobs: number,
): number {
  if (maxConcurrentJobs <= 0) {
    return 0;
  }

  const ratio = activeJobCount / maxConcurrentJobs;
  return Math.min(1, Math.max(0, 1 - ratio));
}

function distanceScore(distanceKm: number, maxRadiusKm: number): number {
  const capped = Math.min(distanceKm, maxRadiusKm);
  return Math.min(1, Math.max(0, 1 - capped / maxRadiusKm));
}

function parseInstallPincodeFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const root = metadata as Record<string, unknown>;
  const request = root.installationRequest;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return null;
  }

  const pincode = (request as Record<string, unknown>).installPincode;
  return typeof pincode === "string" ? normalizePincode(pincode) : null;
}

export type InstallationAutoAssignmentResult =
  | {
      status: "assigned";
      installationJobId: string;
      assignedServiceCenterId: string;
      assignedTechnicianId: string;
    }
  | {
      status: "pending_assignment";
      installationJobId: string;
      reason: string;
    };

export async function autoAssignInstallationJob(
  installationJobId: string,
): Promise<InstallationAutoAssignmentResult> {
  const job = await db.installationJob.findUnique({
    where: {
      id: installationJobId,
    },
    select: {
      id: true,
      assetId: true,
      status: true,
      assignedServiceCenterId: true,
      assignedTechnicianId: true,
      manufacturerOrgId: true,
      metadata: true,
      asset: {
        select: {
          productModel: {
            select: {
              category: true,
              installationOwnershipMode: true,
            },
          },
        },
      },
    },
  });

  if (!job) {
    throw new Error("Installation job not found.");
  }

  if (job.assignedServiceCenterId && job.assignedTechnicianId) {
    return {
      status: "assigned",
      installationJobId,
      assignedServiceCenterId: job.assignedServiceCenterId,
      assignedTechnicianId: job.assignedTechnicianId,
    };
  }

  if (job.status !== "pending_assignment") {
    return {
      status: "pending_assignment",
      installationJobId,
      reason: "Installation job is no longer pending assignment.",
    };
  }

  const installPincode = parseInstallPincodeFromMetadata(job.metadata);
  const productCategory = job.asset.productModel.category;
  const manufacturerOnly =
    job.asset.productModel.installationOwnershipMode === "manufacturer_only";

  const authorizedCenters = await db.serviceCenter.findMany({
    where: manufacturerOnly
      ? {
          isActive: true,
          organizationId: job.manufacturerOrgId,
        }
      : {
          isActive: true,
          OR: [
            {
              organizationId: job.manufacturerOrgId,
            },
            {
              manufacturerAuthorizations: {
                has: job.manufacturerOrgId,
              },
            },
          ],
        },
    select: {
      id: true,
      pincode: true,
      serviceRadiusKm: true,
      supportedCategories: true,
    },
  });

  const categoryCompatibleCenters = authorizedCenters.filter((center) =>
    hasCategorySupport(center.supportedCategories, productCategory),
  );

  if (categoryCompatibleCenters.length === 0) {
    return {
      status: "pending_assignment",
      installationJobId,
      reason: "No authorized installation center supports this product category.",
    };
  }

  const nearbyCenters = categoryCompatibleCenters.filter((center) => {
    const estimatedKm = estimateDistanceKm(center.pincode, installPincode);
    const centerRadius = Math.max(
      center.serviceRadiusKm,
      DEFAULT_MAX_RADIUS_KM,
    );
    return estimatedKm <= centerRadius;
  });

  const eligibleCenters =
    nearbyCenters.length > 0 ? nearbyCenters : categoryCompatibleCenters;

  const technicians = await db.technician.findMany({
    where: {
      serviceCenterId: {
        in: eligibleCenters.map((center) => center.id),
      },
      isAvailable: true,
    },
    select: {
      id: true,
      serviceCenterId: true,
      activeJobCount: true,
      maxConcurrentJobs: true,
      serviceCenter: {
        select: {
          pincode: true,
        },
      },
    },
  });

  const candidates = technicians
    .filter((tech) => {
      const maxJobs =
        tech.maxConcurrentJobs > 0
          ? tech.maxConcurrentJobs
          : DEFAULT_MAX_CONCURRENT_JOBS;

      return tech.activeJobCount < maxJobs;
    })
    .map<InstallationAssignmentCandidate>((tech) => {
      const maxJobs =
        tech.maxConcurrentJobs > 0
          ? tech.maxConcurrentJobs
          : DEFAULT_MAX_CONCURRENT_JOBS;
      const estimatedDistanceKm = estimateDistanceKm(
        tech.serviceCenter.pincode,
        installPincode,
      );

      const score =
        workloadScore(tech.activeJobCount, maxJobs) * 0.65 +
        distanceScore(estimatedDistanceKm, DEFAULT_MAX_RADIUS_KM) * 0.35;

      return {
        technicianId: tech.id,
        serviceCenterId: tech.serviceCenterId,
        score,
        estimatedDistanceKm,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.estimatedDistanceKm - right.estimatedDistanceKm;
    });

  const bestMatch = candidates[0];

  if (!bestMatch) {
    return {
      status: "pending_assignment",
      installationJobId,
      reason: "No available installation engineer met capacity filters.",
    };
  }

  const nextStatus: InstallationJobStatus = "assigned";

  await db.$transaction(async (tx) => {
    await tx.installationJob.update({
      where: {
        id: installationJobId,
      },
      data: {
        assignedServiceCenterId: bestMatch.serviceCenterId,
        assignedTechnicianId: bestMatch.technicianId,
        status: nextStatus,
      },
    });

    await tx.technician.update({
      where: {
        id: bestMatch.technicianId,
      },
      data: {
        activeJobCount: {
          increment: 1,
        },
      },
    });

    await tx.assetIdentity.update({
      where: {
        id: job.assetId,
      },
      data: {
        lifecycleState: installationJobLifecycleState(nextStatus),
      },
    });
  });

  return {
    status: "assigned",
    installationJobId,
    assignedServiceCenterId: bestMatch.serviceCenterId,
    assignedTechnicianId: bestMatch.technicianId,
  };
}

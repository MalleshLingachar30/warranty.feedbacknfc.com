import "server-only";

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/notifications";

const WEIGHTS = {
  distance: 0.4,
  rating: 0.25,
  workload: 0.2,
  skillMatch: 0.15,
} as const;

const DEFAULT_MAX_RADIUS_KM = 50;
const DEFAULT_MAX_CONCURRENT_JOBS = 3;

type ScoreBreakdown = {
  distance: number;
  rating: number;
  workload: number;
  skillMatch: number;
  weightedScore: number;
  estimatedDistanceKm: number;
};

export interface TechnicianRankingItem {
  technicianId: string;
  technicianName: string;
  serviceCenterId: string;
  serviceCenterName: string;
  breakdown: ScoreBreakdown;
}

export interface TechnicianAssignmentResult {
  status: "assigned" | "escalated";
  ticketId: string;
  assignedTechnicianId?: string;
  assignedServiceCenterId?: string;
  reason?: string;
  rankedCandidates: TechnicianRankingItem[];
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(String(value));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

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

function skillMatchScore(
  technicianSkills: string[],
  requiredSkills: string[],
): number {
  if (requiredSkills.length === 0) {
    return 1;
  }

  const normalizedTechSkills = new Set(
    technicianSkills.map((skill) => skill.trim().toLowerCase()).filter(Boolean),
  );

  const matches = requiredSkills
    .map((skill) => skill.trim().toLowerCase())
    .filter((skill) => normalizedTechSkills.has(skill)).length;

  return Math.min(1, Math.max(0, matches / requiredSkills.length));
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

function ratingScore(rating: number): number {
  return Math.min(1, Math.max(0, rating / 5));
}

function hasCategorySupport(
  supportedCategories: string[],
  category: string,
): boolean {
  if (supportedCategories.length === 0) {
    return true;
  }

  const normalizedCategory = category.trim().toLowerCase();

  return supportedCategories.some(
    (entry) => entry.trim().toLowerCase() === normalizedCategory,
  );
}

function hasRequiredSkillMatch(
  technicianSkills: string[],
  requiredSkills: string[],
): boolean {
  if (requiredSkills.length === 0) {
    return true;
  }

  return skillMatchScore(technicianSkills, requiredSkills) > 0;
}

function hasCustomerPincode(
  customerPincode: string | null | undefined,
): boolean {
  return Boolean(normalizePincode(customerPincode));
}

async function notifyManualAssignmentRequired(input: {
  ticketNumber: string;
  productCategory: string;
  reason: string;
  serviceCenterContacts: Array<{
    email: string | null;
    name: string;
  }>;
}) {
  const recipients = Array.from(
    new Set(
      input.serviceCenterContacts
        .map((center) => center.email?.trim() ?? "")
        .filter((email) => email.length > 0),
    ),
  );

  if (recipients.length === 0) {
    return;
  }

  await sendEmail({
    to: recipients,
    subject: `Manual assignment required: ${input.ticketNumber}`,
    body: `Ticket ${input.ticketNumber} requires manual assignment. Product category: ${input.productCategory}. Reason: ${input.reason}.`,
  });
}

export async function assignTechnician(
  ticketId: string,
  options?: {
    maxRadiusKm?: number;
    maxConcurrentJobs?: number;
  },
): Promise<TechnicianAssignmentResult> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      product: {
        include: {
          productModel: {
            select: {
              category: true,
              requiredSkills: true,
            },
          },
        },
      },
    },
  });

  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  if (ticket.assignedTechnicianId) {
    return {
      status: "assigned",
      ticketId,
      assignedTechnicianId: ticket.assignedTechnicianId,
      assignedServiceCenterId: ticket.assignedServiceCenterId ?? undefined,
      reason: "Ticket already has an assigned technician.",
      rankedCandidates: [],
    };
  }

  const manufacturerOrgId = ticket.product.organizationId;
  const productCategory = ticket.product.productModel.category;
  const requiredSkills = ticket.product.productModel.requiredSkills;
  const customerPincode = ticket.product.customerPincode;

  const maxRadiusKm = options?.maxRadiusKm ?? DEFAULT_MAX_RADIUS_KM;
  const defaultMaxConcurrentJobs =
    options?.maxConcurrentJobs ?? DEFAULT_MAX_CONCURRENT_JOBS;

  // 1) Find service centers authorized for this manufacturer.
  const authorizedCenters = await db.serviceCenter.findMany({
    where: {
      isActive: true,
      manufacturerAuthorizations: {
        has: manufacturerOrgId,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      pincode: true,
      serviceRadiusKm: true,
      supportedCategories: true,
    },
  });

  const categoryCompatibleCenters = authorizedCenters.filter((center) =>
    hasCategorySupport(center.supportedCategories, productCategory),
  );

  // 2) Filter by proximity (pincode-based approximation).
  const nearbyCenters = categoryCompatibleCenters.filter((center) => {
    const estimatedKm = estimateDistanceKm(center.pincode, customerPincode);
    const centerRadius = Math.max(center.serviceRadiusKm, maxRadiusKm);
    return estimatedKm <= centerRadius;
  });

  if (nearbyCenters.length === 0) {
    await db.$transaction([
      db.ticket.update({
        where: { id: ticketId },
        data: {
          status: "escalated",
          assignmentMethod: "escalated",
          assignmentNotes:
            "AI assignment escalation: no authorized nearby service center available.",
          escalationLevel: {
            increment: 1,
          },
          escalatedAt: new Date(),
          escalationReason:
            "No authorized nearby service center available for this product category.",
        },
      }),
      db.ticketTimeline.create({
        data: {
          ticketId,
          eventType: "assignment_escalated",
          eventDescription:
            "AI assignment escalated: no authorized nearby service center.",
          actorRole: "system",
          actorName: "AI Assignment Engine",
        },
      }),
    ]);

    void notifyManualAssignmentRequired({
      ticketNumber: ticket.ticketNumber,
      productCategory,
      reason: "No authorized nearby service center found.",
      serviceCenterContacts: categoryCompatibleCenters,
    });

    return {
      status: "escalated",
      ticketId,
      reason: "No authorized nearby service center found.",
      rankedCandidates: [],
    };
  }

  const nearbyCenterIds = nearbyCenters.map((center) => center.id);

  // 3) Find available technicians with matching skills and acceptable workload.
  const technicians = await db.technician.findMany({
    where: {
      serviceCenterId: {
        in: nearbyCenterIds,
      },
      isAvailable: true,
    },
    select: {
      id: true,
      name: true,
      serviceCenterId: true,
      skills: true,
      rating: true,
      activeJobCount: true,
      maxConcurrentJobs: true,
      serviceCenter: {
        select: {
          name: true,
          pincode: true,
        },
      },
    },
  });

  const filteredTechnicians = technicians.filter((tech) => {
    const maxJobs =
      tech.maxConcurrentJobs > 0
        ? tech.maxConcurrentJobs
        : defaultMaxConcurrentJobs;

    return (
      tech.activeJobCount < maxJobs &&
      hasRequiredSkillMatch(tech.skills, requiredSkills)
    );
  });

  // 4) Score and rank technicians.
  const rawRankedCandidates = filteredTechnicians
    .map<TechnicianRankingItem>((tech) => {
      const estimatedDistanceKm = estimateDistanceKm(
        tech.serviceCenter.pincode,
        customerPincode,
      );
      const techMaxJobs =
        tech.maxConcurrentJobs > 0
          ? tech.maxConcurrentJobs
          : defaultMaxConcurrentJobs;

      const breakdown: ScoreBreakdown = {
        distance: distanceScore(estimatedDistanceKm, maxRadiusKm),
        rating: ratingScore(toNumber(tech.rating)),
        workload: workloadScore(tech.activeJobCount, techMaxJobs),
        skillMatch: skillMatchScore(tech.skills, requiredSkills),
        weightedScore: 0,
        estimatedDistanceKm,
      };

      breakdown.weightedScore =
        breakdown.distance * WEIGHTS.distance +
        breakdown.rating * WEIGHTS.rating +
        breakdown.workload * WEIGHTS.workload +
        breakdown.skillMatch * WEIGHTS.skillMatch;

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        serviceCenterId: tech.serviceCenterId,
        serviceCenterName: tech.serviceCenter.name,
        breakdown,
      };
    })
    .sort((left, right) => {
      const weightedDelta =
        right.breakdown.weightedScore - left.breakdown.weightedScore;

      if (weightedDelta !== 0) {
        return weightedDelta;
      }

      return left.breakdown.estimatedDistanceKm - right.breakdown.estimatedDistanceKm;
    });

  const rankedCandidates = hasCustomerPincode(customerPincode)
    ? rawRankedCandidates
    : [...rawRankedCandidates].sort((left, right) => {
        if (right.breakdown.workload !== left.breakdown.workload) {
          return right.breakdown.workload - left.breakdown.workload;
        }

        return right.breakdown.weightedScore - left.breakdown.weightedScore;
      });

  // 5) Assign top-scored technician.
  const bestMatch = rankedCandidates[0];

  if (!bestMatch) {
    await db.$transaction([
      db.ticket.update({
        where: { id: ticketId },
        data: {
          status: "escalated",
          assignmentMethod: "escalated",
          assignmentNotes:
            "AI assignment escalation: no technician met workload/skill filters.",
          escalationLevel: {
            increment: 1,
          },
          escalatedAt: new Date(),
          escalationReason: "No available technician met matching criteria.",
        },
      }),
      db.ticketTimeline.create({
        data: {
          ticketId,
          eventType: "assignment_escalated",
          eventDescription:
            "AI assignment escalated: no technician met matching criteria.",
          actorRole: "system",
          actorName: "AI Assignment Engine",
        },
      }),
    ]);

    void notifyManualAssignmentRequired({
      ticketNumber: ticket.ticketNumber,
      productCategory,
      reason: "No available technician met matching criteria.",
      serviceCenterContacts: nearbyCenters,
    });

    return {
      status: "escalated",
      ticketId,
      reason: "No available technician met matching criteria.",
      rankedCandidates,
    };
  }

  // 6) Persist assignment.
  await db.$transaction([
    db.ticket.update({
      where: { id: ticketId },
      data: {
        status: "assigned",
        assignedServiceCenterId: bestMatch.serviceCenterId,
        assignedTechnicianId: bestMatch.technicianId,
        assignmentMethod: "ai_auto",
        assignmentNotes: `AI score ${bestMatch.breakdown.weightedScore.toFixed(3)} (distance=${bestMatch.breakdown.distance.toFixed(2)}, rating=${bestMatch.breakdown.rating.toFixed(2)}, workload=${bestMatch.breakdown.workload.toFixed(2)}, skill=${bestMatch.breakdown.skillMatch.toFixed(2)})`,
        assignedAt: new Date(),
      },
    }),
    db.technician.update({
      where: { id: bestMatch.technicianId },
      data: {
        activeJobCount: {
          increment: 1,
        },
      },
    }),
    db.ticketTimeline.create({
      data: {
        ticketId,
        eventType: "assigned",
        eventDescription: `AI assigned ${bestMatch.technicianName} from ${bestMatch.serviceCenterName}.`,
        actorRole: "system",
        actorName: "AI Assignment Engine",
        metadata: {
          score: Number(bestMatch.breakdown.weightedScore.toFixed(4)),
          estimatedDistanceKm: bestMatch.breakdown.estimatedDistanceKm,
          weightBreakdown: {
            distance: Number(bestMatch.breakdown.distance.toFixed(4)),
            rating: Number(bestMatch.breakdown.rating.toFixed(4)),
            workload: Number(bestMatch.breakdown.workload.toFixed(4)),
            skillMatch: Number(bestMatch.breakdown.skillMatch.toFixed(4)),
          },
        },
      },
    }),
  ]);

  return {
    status: "assigned",
    ticketId,
    assignedTechnicianId: bestMatch.technicianId,
    assignedServiceCenterId: bestMatch.serviceCenterId,
    rankedCandidates,
  };
}

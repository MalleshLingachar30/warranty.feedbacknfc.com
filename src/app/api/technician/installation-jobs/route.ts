import { NextResponse } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { clerkOrDbHasRole } from "@/lib/rbac";

export const runtime = "nodejs";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function parseRequiredPhotoPolicy(value: unknown) {
  const source = isRecord(value) ? value : {};

  const minimumPhotoCount =
    typeof source.minimumPhotoCount === "number" &&
    Number.isFinite(source.minimumPhotoCount)
      ? Math.max(0, Math.floor(source.minimumPhotoCount))
      : 0;

  return {
    requireBeforePhoto: source.requireBeforePhoto === true,
    requireAfterPhoto: source.requireAfterPhoto === true,
    minimumPhotoCount,
  };
}

export async function GET() {
  try {
    const authData = await getOptionalAuth();

    if (!authData.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleGuardDisabled =
      process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true";

    if (!roleGuardDisabled) {
      const hasRequiredRole = await clerkOrDbHasRole({
        clerkUserId: authData.userId,
        orgRole: authData.orgRole,
        sessionClaims: authData.sessionClaims,
        requiredRole: "technician",
      });

      if (!hasRequiredRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const technician = await db.technician.findFirst({
      where: {
        user: {
          clerkId: authData.userId,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        serviceCenter: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!technician) {
      return NextResponse.json(
        {
          error:
            "No technician profile found for this account. Ask your service center admin to add you.",
        },
        { status: 400 },
      );
    }

    const jobs = await db.installationJob.findMany({
      where: {
        assignedTechnicianId: technician.id,
      },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: 150,
      select: {
        id: true,
        jobNumber: true,
        status: true,
        scheduledFor: true,
        createdAt: true,
        technicianStartedAt: true,
        technicianCompletedAt: true,
        activationTriggeredAt: true,
        checklistTemplateSnapshot: true,
        commissioningTemplateSnapshot: true,
        asset: {
          select: {
            id: true,
            publicCode: true,
            serialNumber: true,
            lifecycleState: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
                installationOwnershipMode: true,
                partTraceabilityMode: true,
                requiredGeoCapture: true,
                customerAcknowledgementRequired: true,
                requiredPhotoPolicy: true,
              },
            },
          },
        },
        manufacturerOrg: {
          select: {
            name: true,
          },
        },
        assignedServiceCenter: {
          select: {
            name: true,
          },
        },
        saleRegistration: {
          select: {
            registeredAt: true,
            dealerName: true,
            distributorName: true,
          },
        },
        installationReport: {
          select: {
            id: true,
            submittedAt: true,
            customerName: true,
            submittedByRole: true,
          },
        },
      },
    });

    return NextResponse.json({
      technician: {
        id: technician.id,
        name: technician.name,
        phone: technician.phone,
        serviceCenterName: technician.serviceCenter.name,
      },
      jobs: jobs.map((job) => ({
        id: job.id,
        jobNumber: job.jobNumber,
        status: job.status,
        scheduledFor: job.scheduledFor?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        technicianStartedAt: job.technicianStartedAt?.toISOString() ?? null,
        technicianCompletedAt: job.technicianCompletedAt?.toISOString() ?? null,
        activationTriggeredAt: job.activationTriggeredAt?.toISOString() ?? null,
        checklistTemplateSnapshot: parseStringList(job.checklistTemplateSnapshot),
        commissioningTemplateSnapshot: parseStringList(
          job.commissioningTemplateSnapshot,
        ),
        asset: {
          id: job.asset.id,
          code: job.asset.publicCode,
          serialNumber: job.asset.serialNumber ?? "",
          lifecycleState: job.asset.lifecycleState,
        },
        productModel: {
          name: job.asset.productModel.name,
          modelNumber: job.asset.productModel.modelNumber ?? "",
          installationOwnershipMode:
            job.asset.productModel.installationOwnershipMode,
          partTraceabilityMode: job.asset.productModel.partTraceabilityMode,
          requiredGeoCapture: job.asset.productModel.requiredGeoCapture,
          customerAcknowledgementRequired:
            job.asset.productModel.customerAcknowledgementRequired,
          requiredPhotoPolicy: parseRequiredPhotoPolicy(
            job.asset.productModel.requiredPhotoPolicy,
          ),
        },
        manufacturerName: job.manufacturerOrg.name,
        assignedServiceCenterName: job.assignedServiceCenter?.name ?? "",
        saleRegistration: job.saleRegistration
          ? {
              registeredAt: job.saleRegistration.registeredAt.toISOString(),
              dealerName: job.saleRegistration.dealerName,
              distributorName: job.saleRegistration.distributorName,
            }
          : null,
        installationReport: job.installationReport
          ? {
              id: job.installationReport.id,
              submittedAt: job.installationReport.submittedAt.toISOString(),
              customerName: job.installationReport.customerName,
              submittedByRole: job.installationReport.submittedByRole,
            }
          : null,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load installation jobs.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

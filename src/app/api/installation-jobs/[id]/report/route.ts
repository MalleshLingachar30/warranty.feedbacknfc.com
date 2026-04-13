import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/otp-session";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";
import {
  installationJobSelect,
  serializeInstallationJobRow,
} from "@/lib/installation-workflow-view";
import { clerkOrDbHasRole } from "@/lib/rbac";
import {
  sendCustomerWarrantyActivatedEmail,
  sendWarrantyActivatedNotification,
} from "@/lib/warranty-notifications";
import {
  parsePartUsageInputs,
  resolvePartUsages,
  toJobPartUsageCreateManyInput,
  validatePartUsagePolicy,
} from "@/lib/job-part-usage";

export const runtime = "nodejs";

type GenericRecord = Record<string, unknown>;

type InstallationReportPayload = {
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  installAddress?: unknown;
  installCity?: unknown;
  installState?: unknown;
  installPincode?: unknown;
  installationDate?: unknown;
  installerName?: unknown;
  unitSerialNumber?: unknown;
  geoLocation?: unknown;
  customerAcknowledgementType?: unknown;
  customerAcknowledgementPayload?: unknown;
  beforePhotoUrls?: unknown;
  afterPhotoUrls?: unknown;
  checklistResponses?: unknown;
  commissioningData?: unknown;
  partUsages?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): GenericRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as GenericRecord;
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function parsePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function parseTemplateList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeTemplateResponses(
  template: string[],
  value: unknown,
): Record<string, string> | null {
  const record: Record<string, string> = {};

  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = asRecord(entry);
      const key = asString(candidate.key) ?? asString(candidate.label);
      const response =
        asString(candidate.value) ??
        asString(candidate.response) ??
        asString(candidate.answer);

      if (key && response) {
        record[key] = response;
      }
    }
  } else {
    const source = asRecord(value);

    for (const [key, rawValue] of Object.entries(source)) {
      const response = asString(rawValue);
      if (response) {
        record[key] = response;
      }
    }
  }

  if (template.length === 0) {
    return Object.keys(record).length > 0 ? record : {};
  }

  for (const label of template) {
    if (!record[label]) {
      return null;
    }
  }

  return Object.fromEntries(template.map((label) => [label, record[label] ?? ""]));
}

function parseGeoLocation(value: unknown) {
  const source = asRecord(value);
  const latitude = Number(source.latitude ?? source.lat);
  const longitude = Number(source.longitude ?? source.lng);
  const accuracy = Number(source.accuracy ?? 0);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : 0,
  };
}

function parseAcknowledgementType(value: unknown) {
  switch (value) {
    case "otp":
    case "signature":
    case "digital_acceptance":
      return value;
    default:
      return null;
  }
}

function isValidAcknowledgementPayload(value: unknown) {
  const source = asRecord(value);

  if (source.accepted === true) {
    return true;
  }

  return Object.values(source).some((entry) => {
    if (typeof entry === "boolean") {
      return entry;
    }

    if (typeof entry === "string") {
      return entry.trim().length > 0;
    }

    return false;
  });
}

function buildSyntheticClerkId(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0
    ? `customer_phone_${digits}`
    : `customer_${crypto.randomUUID()}`;
}

function addMonths(input: Date, months: number): Date {
  const output = new Date(input);
  output.setMonth(output.getMonth() + months);
  return output;
}

function formatWarrantyEndDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authData = await getOptionalAuth();

    if (!authData.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleGuardDisabled =
      process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true";

    const [hasTechnicianRole, hasManufacturerRole] = roleGuardDisabled
      ? [true, true]
      : await Promise.all([
          clerkOrDbHasRole({
            clerkUserId: authData.userId,
            orgRole: authData.orgRole,
            sessionClaims: authData.sessionClaims,
            requiredRole: "technician",
          }),
          clerkOrDbHasRole({
            clerkUserId: authData.userId,
            orgRole: authData.orgRole,
            sessionClaims: authData.sessionClaims,
            requiredRole: "manufacturer_admin",
          }),
        ]);

    if (!hasTechnicianRole && !hasManufacturerRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as InstallationReportPayload;

    const customerName = asString(body.customerName);
    const normalizedPhone = normalizePhone(asString(body.customerPhone) ?? "");
    const customerEmail = asString(body.customerEmail);
    const installAddress = asString(body.installAddress);
    const installCity = asString(body.installCity);
    const installState = asString(body.installState);
    const installPincode = asString(body.installPincode);
    const installationDate = parseDate(body.installationDate);
    const installerName = asString(body.installerName);
    const unitSerialNumber = asString(body.unitSerialNumber);
    const geoLocation = parseGeoLocation(body.geoLocation);
    const customerAcknowledgementType = parseAcknowledgementType(
      body.customerAcknowledgementType,
    );
    const customerAcknowledgementPayload = asRecord(
      body.customerAcknowledgementPayload,
    );
    const beforePhotoUrls = parsePhotoUrls(body.beforePhotoUrls);
    const afterPhotoUrls = parsePhotoUrls(body.afterPhotoUrls);
    const parsedPartUsages = parsePartUsageInputs({
      value: body.partUsages,
      defaultUsageType: "installed",
    });

    if (
      !customerName ||
      !normalizedPhone ||
      !installAddress ||
      !installCity ||
      !installState ||
      !installPincode ||
      !installationDate ||
      !installerName ||
      !unitSerialNumber
    ) {
      return NextResponse.json(
        {
          error:
            "Customer, address, installation date, installer name, and unit serial fields are required.",
        },
        { status: 400 },
      );
    }

    if (!customerAcknowledgementType || !isValidAcknowledgementPayload(customerAcknowledgementPayload)) {
      return NextResponse.json(
        {
          error:
            "Customer acknowledgement type and acknowledgement proof are required.",
        },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: {
        clerkId: authData.userId,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        languagePreference: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Authenticated platform user not found." },
        { status: 400 },
      );
    }

    const technician = hasTechnicianRole
      ? await db.technician.findFirst({
          where: {
            userId: user.id,
          },
          select: {
            id: true,
            name: true,
            serviceCenterId: true,
            serviceCenter: {
              select: {
                organizationId: true,
              },
            },
          },
        })
      : null;

    const job = await db.installationJob.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        jobNumber: true,
        status: true,
        assetId: true,
        manufacturerOrgId: true,
        assignedServiceCenterId: true,
        assignedTechnicianId: true,
        installationReport: {
          select: {
            id: true,
          },
        },
        asset: {
          select: {
            id: true,
            organizationId: true,
            productModelId: true,
            serialNumber: true,
            publicCode: true,
            productModel: {
              select: {
                name: true,
                warrantyDurationMonths: true,
                installationOwnershipMode: true,
                partTraceabilityMode: true,
                smallPartTrackingMode: true,
                requiredGeoCapture: true,
                customerAcknowledgementRequired: true,
                requiredPhotoPolicy: true,
                includedKitDefinition: true,
              },
            },
          },
        },
        checklistTemplateSnapshot: true,
        commissioningTemplateSnapshot: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Installation job not found." },
        { status: 404 },
      );
    }

    if (job.installationReport) {
      return NextResponse.json(
        { error: "Installation report already exists for this job." },
        { status: 409 },
      );
    }

    if (
      job.status !== "commissioning" &&
      job.status !== "on_site" &&
      job.status !== "technician_enroute"
    ) {
      return NextResponse.json(
        {
          error:
            "Installation report can only be submitted when the job is in execution.",
        },
        { status: 409 },
      );
    }

    let submittedByRole:
      | "manufacturer_engineer"
      | "dealer_engineer"
      | "dealer_technician";

    if (technician) {
      if (
        job.assignedTechnicianId &&
        job.assignedTechnicianId !== technician.id
      ) {
        return NextResponse.json(
          { error: "Installation job is assigned to another technician." },
          { status: 403 },
        );
      }

      if (
        job.assignedServiceCenterId &&
        job.assignedServiceCenterId !== technician.serviceCenterId
      ) {
        return NextResponse.json(
          { error: "Technician does not belong to the assigned service center." },
          { status: 403 },
        );
      }

      const isManufacturerCenter =
        technician.serviceCenter.organizationId === job.manufacturerOrgId;

      if (job.asset.productModel.installationOwnershipMode === "manufacturer_only") {
        if (!isManufacturerCenter) {
          return NextResponse.json(
            {
              error:
                "This model can only be installed by a manufacturer service engineer.",
            },
            { status: 403 },
          );
        }

        submittedByRole = "manufacturer_engineer";
      } else {
        submittedByRole = isManufacturerCenter
          ? "manufacturer_engineer"
          : "dealer_technician";
      }
    } else {
      if (!hasManufacturerRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (job.asset.productModel.installationOwnershipMode !== "manufacturer_only") {
        return NextResponse.json(
          {
            error:
              "Manufacturer-admin submission is only allowed for manufacturer-only installation models.",
          },
          { status: 403 },
        );
      }

      if (user.organizationId !== job.manufacturerOrgId) {
        return NextResponse.json(
          { error: "You do not belong to the manufacturer for this job." },
          { status: 403 },
        );
      }

      submittedByRole = "manufacturer_engineer";
    }

    if (job.asset.serialNumber && unitSerialNumber !== job.asset.serialNumber) {
      return NextResponse.json(
        { error: "Unit serial number does not match the assigned asset." },
        { status: 400 },
      );
    }

    if (job.asset.productModel.requiredGeoCapture && !geoLocation) {
      return NextResponse.json(
        { error: "Geo location capture is required for this installation." },
        { status: 400 },
      );
    }

    const requiredPhotoPolicy = asRecord(job.asset.productModel.requiredPhotoPolicy);
    const requireBeforePhoto = requiredPhotoPolicy.requireBeforePhoto === true;
    const requireAfterPhoto = requiredPhotoPolicy.requireAfterPhoto === true;
    const minimumPhotoCount = Math.max(
      0,
      Number(requiredPhotoPolicy.minimumPhotoCount ?? 0) || 0,
    );

    if (requireBeforePhoto && beforePhotoUrls.length === 0) {
      return NextResponse.json(
        { error: "Before photo proof is required for this installation." },
        { status: 400 },
      );
    }

    if (requireAfterPhoto && afterPhotoUrls.length === 0) {
      return NextResponse.json(
        { error: "After photo proof is required for this installation." },
        { status: 400 },
      );
    }

    const photoUrls = [...beforePhotoUrls, ...afterPhotoUrls];
    if (photoUrls.length < Math.max(1, minimumPhotoCount)) {
      return NextResponse.json(
        {
          error: `At least ${Math.max(1, minimumPhotoCount)} proof photos are required.`,
        },
        { status: 400 },
      );
    }

    if (
      job.asset.productModel.customerAcknowledgementRequired &&
      !isValidAcknowledgementPayload(customerAcknowledgementPayload)
    ) {
      return NextResponse.json(
        { error: "Customer acknowledgement is required for this model." },
        { status: 400 },
      );
    }

    const checklistResponses = normalizeTemplateResponses(
      parseTemplateList(job.checklistTemplateSnapshot),
      body.checklistResponses,
    );
    const commissioningData = normalizeTemplateResponses(
      parseTemplateList(job.commissioningTemplateSnapshot),
      body.commissioningData,
    );

    if (!checklistResponses) {
      return NextResponse.json(
        { error: "All checklist responses are required before submission." },
        { status: 400 },
      );
    }

    if (!commissioningData) {
      return NextResponse.json(
        { error: "All commissioning data points are required before submission." },
        { status: 400 },
      );
    }

    const activationAt = new Date();
    const warrantyEndDate = addMonths(
      activationAt,
      job.asset.productModel.warrantyDurationMonths,
    );

    const userLookup: Prisma.UserWhereInput[] = [];
    if (normalizedPhone) {
      userLookup.push({ phone: normalizedPhone });
    }
    if (customerEmail) {
      userLookup.push({ email: customerEmail });
    }

    const linkedProduct = await db.product.findFirst({
      where: {
        organizationId: job.manufacturerOrgId,
        productModelId: job.asset.productModelId,
        serialNumber: unitSerialNumber,
      },
      select: {
        id: true,
        stickerId: true,
        metadata: true,
        sticker: {
          select: {
            stickerNumber: true,
            type: true,
          },
        },
      },
    });

    const certificatePath = linkedProduct
      ? `/api/products/${linkedProduct.id}/certificate?download=1`
      : null;
    const certificateUrl = certificatePath
      ? buildAbsoluteWarrantyUrl(certificatePath)
      : null;
    const geoLocationJson = (geoLocation ?? {}) as unknown as Prisma.InputJsonValue;
    const acknowledgementPayloadJson =
      customerAcknowledgementPayload as unknown as Prisma.InputJsonValue;
    const checklistResponsesJson =
      checklistResponses as unknown as Prisma.InputJsonValue;
    const commissioningDataJson =
      commissioningData as unknown as Prisma.InputJsonValue;

    const updated = await db.$transaction(async (tx) => {
      const existingCustomer =
        userLookup.length > 0
          ? await tx.user.findFirst({
              where: {
                OR: userLookup,
              },
              select: {
                id: true,
                languagePreference: true,
              },
            })
          : null;

      const customer =
        existingCustomer ??
        (await tx.user.create({
          data: {
            clerkId: buildSyntheticClerkId(normalizedPhone),
            role: "customer",
            name: customerName,
            phone: normalizedPhone,
            email: customerEmail,
          },
          select: {
            id: true,
            languagePreference: true,
          },
        }));

      if (existingCustomer) {
        await tx.user.update({
          where: {
            id: existingCustomer.id,
          },
          data: {
            name: customerName,
            phone: normalizedPhone,
            email: customerEmail,
          },
        });
      }

      const resolvedPartUsages = await resolvePartUsages(tx, {
        organizationId: job.manufacturerOrgId,
        parsedUsages: parsedPartUsages,
      });

      await validatePartUsagePolicy(tx, {
        policy: {
          partTraceabilityMode: job.asset.productModel.partTraceabilityMode,
          smallPartTrackingMode: job.asset.productModel.smallPartTrackingMode,
          includedKitDefinition: job.asset.productModel.includedKitDefinition,
        },
        mainAssetId: job.assetId,
        resolvedUsages: resolvedPartUsages,
        workObjectLabel: `installation job ${job.jobNumber}`,
        requireCaptureForPolicy:
          job.asset.productModel.partTraceabilityMode !== "none",
      });

      await tx.installationReport.create({
        data: {
          installationJobId: job.id,
          assetId: job.assetId,
          submittedByUserId: user.id,
          submittedByRole,
          customerName,
          customerPhone: normalizedPhone,
          customerEmail,
          installAddress,
          installCity,
          installState,
          installPincode,
          installationDate,
          installerName,
          unitSerialNumber,
          geoLocation: geoLocationJson,
          customerAcknowledgementType,
          customerAcknowledgementPayload: acknowledgementPayloadJson,
          photoUrls,
          checklistResponses: checklistResponsesJson,
          commissioningData: commissioningDataJson,
          submittedAt: activationAt,
        },
      });

      if (resolvedPartUsages.length > 0) {
        await tx.jobPartUsage.createMany({
          data: toJobPartUsageCreateManyInput({
            mainAssetId: job.assetId,
            installationJobId: job.id,
            linkedByUserId: user.id,
            resolvedUsages: resolvedPartUsages,
          }),
        });
      }

      await tx.assetIdentity.update({
        where: {
          id: job.assetId,
        },
        data: {
          lifecycleState: "active",
          warrantyState: "active",
          customerId: customer.id,
          installationDate,
          installationLocation: {
            ...(geoLocation ?? {}),
            address: installAddress,
            city: installCity,
            state: installState,
            pincode: installPincode,
          } satisfies Prisma.InputJsonValue,
        },
      });

      if (linkedProduct) {
        await tx.product.update({
          where: {
            id: linkedProduct.id,
          },
          data: {
            warrantyStartDate: activationAt,
            warrantyEndDate,
            warrantyStatus: "active",
            installationDate,
            customerId: customer.id,
            customerName,
            customerPhone: normalizedPhone,
            customerPhoneVerified: true,
            customerEmail,
            customerAddress: installAddress,
            customerCity: installCity,
            customerState: installState,
            customerPincode: installPincode,
            activatedVia: "installation_report",
            activatedAtLocation: installCity,
            installationLocation: {
              ...(geoLocation ?? {}),
              address: installAddress,
              city: installCity,
              state: installState,
              pincode: installPincode,
            } satisfies Prisma.InputJsonValue,
            metadata: {
              ...asRecord(linkedProduct.metadata),
              warrantyCertificateUrl: certificateUrl,
              warrantyCertificatePath: certificatePath,
              activationSource: "installation_report",
              activatedVia: "installation_report",
              installationJobId: job.id,
              installationReportSubmittedAt: activationAt.toISOString(),
            } satisfies Prisma.InputJsonValue,
          },
        });

        await tx.sticker.update({
          where: {
            id: linkedProduct.stickerId,
          },
          data: {
            status: "activated",
          },
        });
      }

      const nextJob = await tx.installationJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "completed",
          technicianCompletedAt: activationAt,
          activationTriggeredAt: activationAt,
        },
        select: installationJobSelect,
      });

      return {
        customer,
        job: nextJob,
      };
    });

    if (linkedProduct) {
      void sendWarrantyActivatedNotification({
        customerPhone: normalizedPhone,
        productName: job.asset.productModel.name,
        warrantyEndDateLabel: formatWarrantyEndDate(warrantyEndDate),
        stickerNumber: linkedProduct.sticker.stickerNumber,
        stickerType: linkedProduct.sticker.type,
        certificateUrl,
        languagePreference: updated.customer.languagePreference,
      });

      if (customerEmail) {
        void sendCustomerWarrantyActivatedEmail({
          customerEmail,
          customerName,
          productName: job.asset.productModel.name,
          warrantyEndDateLabel: formatWarrantyEndDate(warrantyEndDate),
          certificateUrl,
        });
      }
    }

    return NextResponse.json({
      job: serializeInstallationJobRow(updated.job),
      activationTriggeredAt: activationAt.toISOString(),
      certificateUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to submit installation report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

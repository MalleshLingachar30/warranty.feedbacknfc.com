import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { installationJobSelect, serializeInstallationJobRow } from "@/lib/installation-workflow-view";
import {
  buildInstallationReportPdfPath,
  buildInstallationReportPdfUrl,
} from "@/lib/installation-report-links";
import {
  installationReportAuthorizationSelect,
} from "@/lib/installation-report-view";
import {
  authorizeOwnerAccess,
  normalizePhone,
} from "@/lib/otp-session";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";
import {
  sendCustomerWarrantyActivatedEmail,
  sendWarrantyActivatedNotification,
} from "@/lib/warranty-notifications";

export const runtime = "nodejs";

type AuthorizeInstallationReportPayload = {
  authorizedByName?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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
    const cookieStore = await cookies();
    const body = (await request.json().catch(() => ({}))) as AuthorizeInstallationReportPayload;
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Installation report id is required." },
        { status: 400 },
      );
    }

    const report = await db.installationReport.findUnique({
      where: {
        id,
      },
      select: installationReportAuthorizationSelect,
    });

    if (!report) {
      return NextResponse.json(
        { error: "Installation report not found." },
        { status: 404 },
      );
    }

    const linkedProduct = await db.product.findFirst({
      where: {
        organizationId: report.installationJob.manufacturerOrgId,
        productModelId: report.asset.productModelId,
        serialNumber: report.unitSerialNumber,
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

    if (!linkedProduct) {
      return NextResponse.json(
        {
          error:
            "Customer warranty surface is missing for this serialized asset. Link/create the product sticker record before authorizing installation report.",
        },
        { status: 409 },
      );
    }

    const ownerAccess = await authorizeOwnerAccess({
      cookiesStore: cookieStore,
      productId: linkedProduct.id,
      ownerPhone: report.customerPhone,
      clerkUserId: authData.userId,
    });

    if (!ownerAccess.valid) {
      return NextResponse.json(
        {
          error:
            "Customer verification is required before authorizing this installation report.",
        },
        { status: 401 },
      );
    }

    const authorizedAt = report.customerAuthorizedAt ?? new Date();
    const authorizedByName =
      asString(body.authorizedByName) ?? report.customerName;
    const normalizedCustomerPhone = normalizePhone(report.customerPhone);
    const warrantyEndDate = addMonths(
      authorizedAt,
      report.asset.productModel.warrantyDurationMonths,
    );
    const certificatePath = `/api/products/${linkedProduct.id}/certificate?download=1`;
    const certificateUrl = buildAbsoluteWarrantyUrl(certificatePath);
    const pdfPath = `${buildInstallationReportPdfPath(report.id)}?download=1`;
    const pdfUrl = buildInstallationReportPdfUrl(report.id);
    const installationLocation = {
      ...asRecord(report.geoLocation),
      address: report.installAddress,
      city: report.installCity,
      state: report.installState,
      pincode: report.installPincode,
    } satisfies Prisma.InputJsonValue;

    const userLookup: Prisma.UserWhereInput[] = [];
    if (normalizedCustomerPhone) {
      userLookup.push({ phone: normalizedCustomerPhone });
    }
    if (report.customerEmail) {
      userLookup.push({ email: report.customerEmail });
    }

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
            clerkId: buildSyntheticClerkId(normalizedCustomerPhone),
            role: "customer",
            name: report.customerName,
            phone: normalizedCustomerPhone,
            email: report.customerEmail,
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
            name: report.customerName,
            phone: normalizedCustomerPhone,
            email: report.customerEmail,
          },
        });
      }

      await tx.installationReport.update({
        where: {
          id: report.id,
        },
        data: {
          customerAuthorizedAt: authorizedAt,
          customerAuthorizedByName: authorizedByName,
          customerAuthorizedByPhone: normalizedCustomerPhone,
          customerAuthorizationPayload: {
            accepted: true,
            authorizedAt: authorizedAt.toISOString(),
            authorizedByName,
            authorizedByPhone: normalizedCustomerPhone,
            authorizationSource: ownerAccess.via ?? "otp",
          } satisfies Prisma.InputJsonValue,
        },
      });

      await tx.assetIdentity.update({
        where: {
          id: report.assetId,
        },
        data: {
          lifecycleState: "active",
          warrantyState: "active",
          customerId: customer.id,
          installationDate: report.installationDate,
          installationLocation,
        },
      });

      await tx.product.update({
        where: {
          id: linkedProduct.id,
        },
        data: {
          warrantyStartDate: authorizedAt,
          warrantyEndDate,
          warrantyStatus: "active",
          installationDate: report.installationDate,
          customerId: customer.id,
          customerName: report.customerName,
          customerPhone: normalizedCustomerPhone,
          customerPhoneVerified: true,
          customerEmail: report.customerEmail,
          customerAddress: report.installAddress,
          customerCity: report.installCity,
          customerState: report.installState,
          customerPincode: report.installPincode,
          activatedVia: "installation_report",
          activatedAtLocation: report.installCity,
          installationLocation,
          metadata: {
            ...asRecord(linkedProduct.metadata),
            warrantyCertificateUrl: certificateUrl,
            warrantyCertificatePath: certificatePath,
            activationSource: "installation_report",
            activatedVia: "installation_report",
            installationJobId: report.installationJobId,
            installationReportId: report.id,
            installationReportPdfUrl: pdfUrl,
            installationReportPdfPath: pdfPath,
            installationReportAuthorizedAt: authorizedAt.toISOString(),
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

      const nextJob = await tx.installationJob.update({
        where: {
          id: report.installationJobId,
        },
        data: {
          status: "completed",
          technicianCompletedAt:
            report.installationJob.technicianCompletedAt ?? report.submittedAt,
          activationTriggeredAt: authorizedAt,
        },
        select: installationJobSelect,
      });

      return {
        customer,
        job: nextJob,
      };
    });

    void sendWarrantyActivatedNotification({
      customerPhone: normalizedCustomerPhone,
      productName: report.asset.productModel.name,
      warrantyEndDateLabel: formatWarrantyEndDate(warrantyEndDate),
      stickerNumber: linkedProduct.sticker.stickerNumber,
      stickerType: linkedProduct.sticker.type,
      certificateUrl,
      languagePreference: updated.customer.languagePreference,
    });

    if (report.customerEmail) {
      void sendCustomerWarrantyActivatedEmail({
        customerEmail: report.customerEmail,
        customerName: report.customerName,
        productName: report.asset.productModel.name,
        warrantyEndDateLabel: formatWarrantyEndDate(warrantyEndDate),
        certificateUrl,
      });
    }

    return NextResponse.json({
      job: serializeInstallationJobRow(updated.job),
      authorizationCompletedAt: authorizedAt.toISOString(),
      certificateUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to authorize installation report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

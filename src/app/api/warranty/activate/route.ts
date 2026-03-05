import { NextResponse } from "next/server";

import { db as prisma } from "@/lib/db";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";
import {
  sendCustomerWarrantyActivatedEmail,
  sendWarrantyActivatedNotification,
} from "@/lib/warranty-notifications";

interface ActivateWarrantyRequest {
  productId?: string;
  customerName?: string;
  customerPhone?: string;
  otpCode?: string;
  customerEmail?: string | null;
  customerAddress?: string | null;
  installationDate?: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function buildSyntheticClerkId(phone: string): string {
  const normalized = phone.replace(/\D/g, "");
  if (!normalized) {
    return `customer_${crypto.randomUUID()}`;
  }

  return `customer_phone_${normalized}`;
}

function formatWarrantyEndDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function addMonths(input: Date, months: number): Date {
  const output = new Date(input);
  output.setMonth(output.getMonth() + months);
  return output;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActivateWarrantyRequest;

    if (!body.productId || !body.customerName || !body.customerPhone) {
      return NextResponse.json(
        {
          error: "productId, customerName, and customerPhone are required.",
        },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: {
        id: true,
        stickerId: true,
        productModelId: true,
        warrantyStatus: true,
        metadata: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    if (product.warrantyStatus !== "pending_activation") {
      return NextResponse.json(
        { error: "Warranty is already activated for this product." },
        { status: 400 },
      );
    }

    const model = await prisma.productModel.findUnique({
      where: { id: product.productModelId },
      select: {
        warrantyDurationMonths: true,
        name: true,
      },
    });

    const warrantyDurationMonths = model?.warrantyDurationMonths ?? 12;
    const now = new Date();
    const warrantyEndDate = addMonths(now, warrantyDurationMonths);

    const normalizedPhone = normalizePhone(body.customerPhone);

    const userLookupFilters: Array<{ phone?: string; email?: string }> = [];

    if (normalizedPhone) {
      userLookupFilters.push({ phone: normalizedPhone });
    }

    if (body.customerEmail) {
      userLookupFilters.push({ email: body.customerEmail });
    }

    const existingUser =
      userLookupFilters.length > 0
        ? await prisma.user.findFirst({
            where: {
              OR: userLookupFilters,
            },
            select: {
              id: true,
            },
          })
        : null;

    const customerUser =
      existingUser ??
      (await prisma.user.create({
        data: {
          clerkId: buildSyntheticClerkId(normalizedPhone),
          role: "customer",
          name: body.customerName,
          phone: normalizedPhone || null,
          email: body.customerEmail ?? null,
        },
        select: {
          id: true,
        },
      }));

    const parsedInstallationDate = body.installationDate
      ? new Date(body.installationDate)
      : now;

    const installationDate = Number.isNaN(parsedInstallationDate.getTime())
      ? now
      : parsedInstallationDate;

    const certificatePath = `/api/products/${product.id}/certificate?download=1`;
    const certificateUrl = buildAbsoluteWarrantyUrl(certificatePath);
    const existingMetadata = asRecord(product.metadata);

    await prisma.$transaction([
      prisma.product.update({
        where: { id: product.id },
        data: {
          warrantyStartDate: now,
          warrantyEndDate,
          warrantyStatus: "active",
          installationDate,
          customerId: customerUser.id,
          customerName: body.customerName,
          customerPhone: normalizedPhone,
          customerEmail: body.customerEmail ?? null,
          customerAddress: body.customerAddress ?? null,
          metadata: {
            ...existingMetadata,
            warrantyCertificateUrl: certificateUrl,
            warrantyCertificatePath: certificatePath,
          },
        },
      }),
      prisma.sticker.updateMany({
        where: { id: product.stickerId },
        data: { status: "activated" },
      }),
    ]);

    if (normalizedPhone) {
      void sendWarrantyActivatedNotification({
        customerPhone: normalizedPhone,
        productName: model?.name ?? "product",
        warrantyEndDateLabel: formatWarrantyEndDate(warrantyEndDate),
        certificateUrl,
      });
    }

    if (body.customerEmail) {
      void sendCustomerWarrantyActivatedEmail({
        customerEmail: body.customerEmail,
        customerName: body.customerName,
        productName: model?.name ?? "product",
        warrantyEndDateLabel: formatWarrantyEndDate(warrantyEndDate),
        certificateUrl,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Warranty activated for ${model?.name ?? "product"}.`,
      warrantyStartDate: now.toISOString(),
      warrantyEndDate: warrantyEndDate.toISOString(),
      certificateUrl,
    });
  } catch (error) {
    console.error("Warranty activation failed", error);
    return NextResponse.json(
      { error: "Unable to activate warranty at this time." },
      { status: 500 },
    );
  }
}

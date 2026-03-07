import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db as prisma } from "@/lib/db";
import {
  normalizePhone,
  validateOwnerSession,
} from "@/lib/otp-session";
import { buildAbsoluteWarrantyUrl } from "@/lib/warranty-app-url";
import {
  sendCustomerWarrantyActivatedEmail,
  sendWarrantyActivatedNotification,
} from "@/lib/warranty-notifications";
import { writeScanLog } from "@/lib/scan-log";

interface ActivateWarrantyRequest {
  productId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string | null;
  customerAddress?: string | null;
  installationDate?: string;
  activationSource?: string | null;
  activationContext?: string | null;
  activatedAtLocation?: string | null;
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

function resolveActivatedVia(input: {
  activationContext: string | null | undefined;
  activationSource: string | null | undefined;
}): "carton_qr" | "product_qr" | "product_nfc" {
  if (input.activationContext === "carton") {
    return "carton_qr";
  }

  if (input.activationContext === "product") {
    return "product_qr";
  }

  if (input.activationSource === "nfc") {
    return "product_nfc";
  }

  return "product_qr";
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
        sticker: {
          select: {
            stickerNumber: true,
            type: true,
          },
        },
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
    const cookieStore = await cookies();
    const ownerSession = await validateOwnerSession(cookieStore, product.id);

    if (!ownerSession.valid || ownerSession.phone !== normalizedPhone) {
      return NextResponse.json(
        { error: "Owner verification required before activation." },
        { status: 403 },
      );
    }

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
              languagePreference: true,
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
          languagePreference: true,
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
    const activationSource =
      body.activationSource === "qr" || body.activationSource === "nfc"
        ? body.activationSource
        : "unknown";
    const activationContext =
      body.activationContext === "carton" || body.activationContext === "product"
        ? body.activationContext
        : null;
    const activatedVia = resolveActivatedVia({
      activationContext,
      activationSource: body.activationSource ?? null,
    });

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
          customerPhoneVerified: true,
          customerEmail: body.customerEmail ?? null,
          customerAddress: body.customerAddress ?? null,
          activatedVia,
          activatedAtLocation: body.activatedAtLocation ?? null,
          metadata: {
            ...existingMetadata,
            warrantyCertificateUrl: certificateUrl,
            warrantyCertificatePath: certificatePath,
            activationSource,
            activationContext,
            activatedVia,
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
        stickerNumber: product.sticker.stickerNumber,
        stickerType: product.sticker.type,
        certificateUrl,
        languagePreference: customerUser.languagePreference,
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

    void writeScanLog({
      stickerNumber: product.sticker.stickerNumber,
      productId: product.id,
      scanSource: activationSource === "unknown" ? null : activationSource,
      scanContext: activationContext,
      viewerType: "owner_verified",
      userId: customerUser.id,
      actionTaken: "activated",
      userAgent: request.headers.get("user-agent"),
      ipAddress:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip"),
    });

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

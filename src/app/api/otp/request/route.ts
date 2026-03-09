import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  isOtpPurpose,
  isValidOtpPhone,
  normalizeLanguagePreference,
  normalizePhone,
  OTP_EXPIRY_SECONDS,
  OTP_RATE_LIMIT_PER_HOUR,
  type OtpPurpose,
} from "@/lib/otp-session";
import { sendOtpVerificationCodeNotification } from "@/lib/warranty-notifications";

export const runtime = "nodejs";

interface RequestOtpBody {
  phone?: unknown;
  productId?: unknown;
  purpose?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function phoneMismatchResponse() {
  return NextResponse.json(
    {
      error: "phone_mismatch",
      message: "This phone number is not registered as the product owner.",
    },
    { status: 403 },
  );
}

async function resolveLanguagePreference(input: {
  purpose: OtpPurpose;
  normalizedPhone: string;
  productCustomerLanguage: string | null | undefined;
}) {
  if (input.purpose !== "activation") {
    return normalizeLanguagePreference(input.productCustomerLanguage);
  }

  const existingUser = await db.user.findFirst({
    where: {
      phone: input.normalizedPhone,
    },
    select: {
      languagePreference: true,
    },
  });

  return normalizeLanguagePreference(existingUser?.languagePreference);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as RequestOtpBody | null;
    const phoneInput = asString(body?.phone);
    const productId = asString(body?.productId);
    const purposeInput = asString(body?.purpose);

    if (!phoneInput || !productId || !purposeInput) {
      return NextResponse.json(
        {
          error: "invalid_request",
          message: "phone, productId, and purpose are required.",
        },
        { status: 400 },
      );
    }

    if (!isOtpPurpose(purposeInput)) {
      return NextResponse.json(
        {
          error: "invalid_purpose",
          message: "Unsupported OTP purpose.",
        },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhone(phoneInput);
    if (!isValidOtpPhone(normalizedPhone)) {
      return NextResponse.json(
        {
          error: "invalid_phone",
          message: "Phone number must be in E.164 format.",
        },
        { status: 400 },
      );
    }

    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        warrantyStatus: true,
        customerPhone: true,
        customer: {
          select: {
            languagePreference: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    if (purposeInput === "activation") {
      if (product.warrantyStatus !== "pending_activation") {
        return NextResponse.json(
          {
            error: "already_activated",
            message: "Product warranty is already activated.",
          },
          { status: 409 },
        );
      }
    } else {
      if (!product.customerPhone) {
        return phoneMismatchResponse();
      }

      if (normalizePhone(product.customerPhone) !== normalizedPhone) {
        return phoneMismatchResponse();
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtpCount = await db.otpSession.count({
      where: {
        phone: normalizedPhone,
        productId: product.id,
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    if (recentOtpCount >= OTP_RATE_LIMIT_PER_HOUR) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: "Too many attempts. Please try again in 1 hour.",
        },
        { status: 429 },
      );
    }

    const otpCode = generateOtpCode();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);
    const languagePreference = await resolveLanguagePreference({
      purpose: purposeInput,
      normalizedPhone,
      productCustomerLanguage: product.customer?.languagePreference,
    });

    await db.otpSession.create({
      data: {
        phone: normalizedPhone,
        productId: product.id,
        purpose: purposeInput,
        otpCode,
        otpExpiresAt,
      },
    });

    try {
      await sendOtpVerificationCodeNotification({
        customerPhone: normalizedPhone,
        otpCode,
        languagePreference,
        strictDelivery: true,
      });
    } catch (deliveryError) {
      await db.otpSession.deleteMany({
        where: {
          phone: normalizedPhone,
          productId: product.id,
          purpose: purposeInput,
          otpCode,
          verified: false,
        },
      });

      console.error("OTP delivery failed", deliveryError);

      return NextResponse.json(
        {
          error: "otp_delivery_failed",
          message:
            "Unable to deliver OTP right now. Please try again in a moment.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent",
      expiresInSeconds: OTP_EXPIRY_SECONDS,
    });
  } catch (error) {
    console.error("OTP request failed", error);
    return NextResponse.json(
      { error: "Unable to send OTP at this time." },
      { status: 500 },
    );
  }
}

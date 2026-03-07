import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  isValidOtpCode,
  isValidOtpPhone,
  issueOwnerSessionCookie,
  normalizeOtpCode,
  normalizePhone,
  OTP_MAX_ATTEMPTS,
} from "@/lib/otp-session";

export const runtime = "nodejs";

interface VerifyOtpBody {
  phone?: unknown;
  productId?: unknown;
  otp?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as VerifyOtpBody | null;
    const phoneInput = asString(body?.phone);
    const productId = asString(body?.productId);
    const otpInput = asString(body?.otp);

    if (!phoneInput || !productId || !otpInput) {
      return NextResponse.json(
        {
          error: "invalid_request",
          message: "phone, productId, and otp are required.",
        },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhone(phoneInput);
    const normalizedOtp = normalizeOtpCode(otpInput);

    if (!isValidOtpPhone(normalizedPhone)) {
      return NextResponse.json(
        {
          error: "invalid_phone",
          message: "Phone number must be in E.164 format.",
        },
        { status: 400 },
      );
    }

    if (!isValidOtpCode(normalizedOtp)) {
      return NextResponse.json(
        {
          error: "invalid_otp",
          message: "OTP must be a 6-digit code.",
        },
        { status: 400 },
      );
    }

    const session = await db.otpSession.findFirst({
      where: {
        phone: normalizedPhone,
        productId,
        verified: false,
        otpExpiresAt: {
          gt: new Date(),
        },
        attempts: {
          lt: OTP_MAX_ATTEMPTS,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        otpCode: true,
        attempts: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          error: "invalid",
          message: "No pending verification found.",
        },
        { status: 400 },
      );
    }

    if (session.otpCode !== normalizedOtp) {
      const updatedSession = await db.otpSession.update({
        where: { id: session.id },
        data: {
          attempts: {
            increment: 1,
          },
        },
        select: {
          attempts: true,
        },
      });

      const attemptsRemaining = Math.max(
        OTP_MAX_ATTEMPTS - updatedSession.attempts,
        0,
      );

      if (attemptsRemaining === 0) {
        return NextResponse.json(
          {
            error: "locked",
            message: "Too many failed attempts. Request a new code.",
          },
          { status: 423 },
        );
      }

      return NextResponse.json(
        {
          error: "wrong_otp",
          attemptsRemaining,
        },
        { status: 400 },
      );
    }

    const sessionToken = randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.otpSession.update({
      where: { id: session.id },
      data: {
        verified: true,
        sessionToken,
        sessionExpiresAt,
      },
    });

    const response = NextResponse.json({
      success: true,
      sessionToken,
    });

    issueOwnerSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    console.error("OTP verification failed", error);
    return NextResponse.json(
      { error: "Unable to verify OTP at this time." },
      { status: 500 },
    );
  }
}

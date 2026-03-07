import "server-only";

import type { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const OTP_EXPIRY_SECONDS = 5 * 60;
export const OWNER_SESSION_EXPIRY_SECONDS = 24 * 60 * 60;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RATE_LIMIT_PER_HOUR = 3;
export const WARRANTY_SESSION_COOKIE_NAME = "warranty_session";

export const OTP_PURPOSES = [
  "activation",
  "report_issue",
  "confirm_resolution",
  "general_access",
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

type CookieGetter = {
  get(name: string): { value: string } | undefined;
};

export function isOtpPurpose(value: string): value is OtpPurpose {
  return OTP_PURPOSES.includes(value as OtpPurpose);
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const hasPlusPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (hasPlusPrefix) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  return `+${digits}`;
}

export function isValidOtpPhone(value: string): boolean {
  return /^\+\d{10,15}$/.test(value);
}

export function normalizeOtpCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isValidOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function normalizeLanguagePreference(
  value: string | null | undefined,
): "en" | "hi" {
  const normalized = value?.trim().toLowerCase();
  if (normalized?.startsWith("hi")) {
    return "hi";
  }

  return "en";
}

export function issueOwnerSessionCookie(
  response: NextResponse,
  sessionToken: string,
): void {
  response.cookies.set({
    name: WARRANTY_SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_SESSION_EXPIRY_SECONDS,
  });
}

export async function validateOwnerSession(
  cookiesStore: CookieGetter,
  productId: string,
): Promise<{
  valid: boolean;
  phone?: string;
  productId?: string;
}> {
  const token = cookiesStore.get(WARRANTY_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { valid: false };
  }

  const session = await db.otpSession.findFirst({
    where: {
      sessionToken: token,
      productId,
      verified: true,
      sessionExpiresAt: {
        gt: new Date(),
      },
    },
    select: {
      phone: true,
      productId: true,
    },
  });

  if (!session) {
    return { valid: false };
  }

  return {
    valid: true,
    phone: session.phone,
    productId: session.productId,
  };
}

export async function authorizeOwnerAccess(input: {
  cookiesStore: CookieGetter;
  productId: string;
  ownerPhone: string | null | undefined;
  clerkUserId?: string | null;
}): Promise<{
  valid: boolean;
  via?: "clerk" | "otp";
  userId?: string;
}> {
  const normalizedOwnerPhone = normalizePhone(input.ownerPhone ?? "");
  if (!normalizedOwnerPhone) {
    return { valid: false };
  }

  if (input.clerkUserId) {
    const dbUser = await db.user.findUnique({
      where: {
        clerkId: input.clerkUserId,
      },
      select: {
        id: true,
        phone: true,
      },
    });

    if (dbUser?.phone && normalizePhone(dbUser.phone) === normalizedOwnerPhone) {
      return {
        valid: true,
        via: "clerk",
        userId: dbUser.id,
      };
    }
  }

  const ownerSession = await validateOwnerSession(
    input.cookiesStore,
    input.productId,
  );

  if (ownerSession.valid && ownerSession.phone === normalizedOwnerPhone) {
    return {
      valid: true,
      via: "otp",
    };
  }

  return { valid: false };
}

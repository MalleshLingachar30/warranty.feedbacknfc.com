import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

const ALLOWED_COUNTRIES = [
  "India",
  "UAE",
  "Saudi Arabia",
  "USA",
  "UK",
  "Singapore",
  "Other",
] as const;

const ALLOWED_USER_TYPES = [
  "Manufacturer",
  "Distributor",
  "Service Center",
  "Retailer",
  "Other",
] as const;

const ALLOWED_LANGUAGES = [
  "English",
  "Hindi (हिन्दी)",
  "Kannada (ಕನ್ನಡ)",
  "Tamil (தமிழ்)",
  "Telugu (తెలుగు)",
  "Marathi (मराठी)",
  "Bengali (বাংলা)",
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s\-()]{6,20}$/;

function getRequiredString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAllowedValue<T extends readonly string[]>(
  options: T,
  value: string,
): value is T[number] {
  return options.includes(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = getRequiredString(body?.name);
    const emailValue = getRequiredString(body?.email);
    const email = emailValue ? emailValue.toLowerCase() : null;
    const phone = getRequiredString(body?.phone);
    const company = getRequiredString(body?.company);
    const country = getRequiredString(body?.country);
    const language = getRequiredString(body?.language);
    const userType = getRequiredString(body?.userType);

    if (
      !name ||
      !email ||
      !phone ||
      !company ||
      !country ||
      !language ||
      !userType
    ) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 },
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Invalid email" },
        { status: 400 },
      );
    }

    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: "Invalid phone" },
        { status: 400 },
      );
    }

    if (!isAllowedValue(ALLOWED_COUNTRIES, country)) {
      return NextResponse.json(
        { error: "Invalid country" },
        { status: 400 },
      );
    }

    if (!isAllowedValue(ALLOWED_LANGUAGES, language)) {
      return NextResponse.json(
        { error: "Invalid language" },
        { status: 400 },
      );
    }

    if (!isAllowedValue(ALLOWED_USER_TYPES, userType)) {
      return NextResponse.json(
        { error: "Invalid userType" },
        { status: 400 },
      );
    }

    const sessionId = crypto.randomUUID();

    await db.chatLead.create({
      data: {
        sessionId,
        name,
        email,
        phone,
        company,
        country,
        language,
        userType,
      },
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error("Lead capture error:", error);
    return NextResponse.json(
      { error: "Failed to capture lead" },
      { status: 500 },
    );
  }
}

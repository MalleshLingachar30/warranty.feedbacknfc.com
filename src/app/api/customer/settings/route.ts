import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { parseAppRoleFromClaims } from "@/lib/roles";

const ALLOWED_LANGUAGES = new Set(["en", "hi", "ta", "kn", "te", "ar"]);

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PUT(request: Request) {
  try {
    const authData = await auth();

    if (!authData.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = parseAppRoleFromClaims(authData.sessionClaims);

    if (
      process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD !== "true" &&
      role !== "customer"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    const record = isRecord(body) ? body : {};
    const languagePreference = asString(record.languagePreference) ?? "en";

    if (!ALLOWED_LANGUAGES.has(languagePreference)) {
      return NextResponse.json(
        {
          error:
            "Invalid languagePreference. Use one of: en, hi, ta, kn, te, ar.",
        },
        { status: 400 },
      );
    }

    const existingUser = await db.user.findUnique({
      where: {
        clerkId: authData.userId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!existingUser) {
      await db.user.create({
        data: {
          clerkId: authData.userId,
          role: "customer",
          languagePreference,
        },
      });

      return NextResponse.json({ success: true });
    }

    await db.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        languagePreference,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Customer settings update failed", error);
    return NextResponse.json(
      { error: "Unable to update settings right now." },
      { status: 500 },
    );
  }
}


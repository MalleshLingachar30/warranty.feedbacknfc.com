import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sendWarrantyExpiryReminderNotification } from "@/lib/warranty-notifications";

export const runtime = "nodejs";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAuthorized(request: Request) {
  if (request.headers.get("x-vercel-cron") === "1") {
    return true;
  }

  const configuredKey = process.env.WARRANTY_EXPIRY_CRON_KEY;

  if (!configuredKey) {
    return process.env.NODE_ENV !== "production";
  }

  const providedKey = request.headers.get("x-warranty-expiry-cron-key");
  return providedKey === configuredKey;
}

function formatWarrantyEndDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getWindow(daysFromNowStart: number, daysFromNowEnd: number) {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() + daysFromNowStart);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + daysFromNowEnd);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

async function handleSweep(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: "Unauthorized warranty expiry sweep request." },
        { status: 401 },
      );
    }

    const window = getWindow(29, 31);
    const products = await db.product.findMany({
      where: {
        warrantyStatus: "active",
        customerPhone: {
          not: null,
        },
        warrantyEndDate: {
          gte: window.start,
          lte: window.end,
        },
      },
      select: {
        id: true,
        customerPhone: true,
        warrantyEndDate: true,
        metadata: true,
        productModel: {
          select: {
            name: true,
          },
        },
      },
      take: 1000,
    });

    let notifiedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      if (!product.customerPhone || !product.warrantyEndDate) {
        skippedCount += 1;
        continue;
      }

      const metadata = isRecord(product.metadata) ? product.metadata : {};
      const notifications = isRecord(metadata.notifications)
        ? metadata.notifications
        : {};

      if (typeof notifications.warrantyExpiry30dSentAt === "string") {
        skippedCount += 1;
        continue;
      }

      await sendWarrantyExpiryReminderNotification({
        customerPhone: product.customerPhone,
        productName: product.productModel.name,
        warrantyEndDateLabel: formatWarrantyEndDate(product.warrantyEndDate),
      });

      await db.product.update({
        where: {
          id: product.id,
        },
        data: {
          metadata: {
            ...metadata,
            notifications: {
              ...notifications,
              warrantyExpiry30dSentAt: new Date().toISOString(),
            },
          },
        },
      });

      notifiedCount += 1;
    }

    return NextResponse.json({
      success: true,
      scannedCount: products.length,
      notifiedCount,
      skippedCount,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
    });
  } catch (error) {
    console.error("Warranty expiry sweep failed", error);
    return NextResponse.json(
      { error: "Unable to process warranty expiry sweep." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handleSweep(request);
}

export async function GET(request: Request) {
  return handleSweep(request);
}

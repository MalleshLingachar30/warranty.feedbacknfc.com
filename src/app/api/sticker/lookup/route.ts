import { NextRequest, NextResponse } from "next/server";

import { db as prisma } from "@/lib/db";
import { parseStickerNumber } from "@/lib/sticker-number";

interface StickerLookupBody {
  number?: unknown;
  id?: unknown;
  stickerNumber?: unknown;
}

function toIdentifierValue(value: unknown): string | number | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

async function lookupSticker(stickerNumber: number) {
  const sticker = await prisma.sticker.findUnique({
    where: { stickerNumber },
    select: {
      id: true,
      stickerNumber: true,
      stickerSerial: true,
      status: true,
      allocatedToOrgId: true,
    },
  });

  if (!sticker) {
    return NextResponse.json({ error: "Sticker not found." }, { status: 404 });
  }

  const product = await prisma.product.findFirst({
    where: { stickerId: sticker.id },
    select: {
      id: true,
      serialNumber: true,
      warrantyStatus: true,
      warrantyStartDate: true,
      warrantyEndDate: true,
    },
  });

  const openTicket = product
    ? await prisma.ticket.findFirst({
        where: {
          productId: product.id,
          status: {
            in: [
              "reported",
              "assigned",
              "technician_enroute",
              "work_in_progress",
              "pending_confirmation",
              "reopened",
              "escalated",
            ],
          },
        },
        orderBy: { reportedAt: "desc" },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          reportedAt: true,
        },
      })
    : null;

  return NextResponse.json({
    sticker,
    product,
    openTicket,
  });
}

export async function GET(request: NextRequest) {
  try {
    const queryValue =
      request.nextUrl.searchParams.get("number") ??
      request.nextUrl.searchParams.get("id");

    const stickerNumber = parseStickerNumber(queryValue);

    if (stickerNumber === null) {
      return NextResponse.json(
        {
          error:
            "Provide a valid sticker number or `/nfc/{number}` URL in the `number` query parameter.",
        },
        { status: 400 },
      );
    }

    return lookupSticker(stickerNumber);
  } catch (error) {
    console.error("Sticker lookup failed", error);
    return NextResponse.json(
      { error: "Unable to look up sticker right now." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as StickerLookupBody;

    const numberParam =
      toIdentifierValue(body.number) ??
      toIdentifierValue(body.id) ??
      toIdentifierValue(body.stickerNumber);

    const stickerNumber = parseStickerNumber(numberParam);

    if (stickerNumber === null) {
      return NextResponse.json(
        { error: "Provide a valid sticker number in `number` or `id`." },
        { status: 400 },
      );
    }

    return lookupSticker(stickerNumber);
  } catch (error) {
    console.error("Sticker lookup failed", error);
    return NextResponse.json(
      { error: "Unable to look up sticker right now." },
      { status: 500 },
    );
  }
}

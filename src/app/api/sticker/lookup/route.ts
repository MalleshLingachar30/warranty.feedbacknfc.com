import { NextRequest, NextResponse } from "next/server";

import { db as prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const numberParam =
      request.nextUrl.searchParams.get("number") ??
      request.nextUrl.searchParams.get("id");

    if (!numberParam) {
      return NextResponse.json(
        { error: "Provide `number` query parameter." },
        { status: 400 },
      );
    }

    const stickerNumber = Number.parseInt(numberParam, 10);

    if (Number.isNaN(stickerNumber)) {
      return NextResponse.json(
        { error: "Sticker number must be a valid integer." },
        { status: 400 },
      );
    }

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
  } catch (error) {
    console.error("Sticker lookup failed", error);
    return NextResponse.json(
      { error: "Unable to look up sticker right now." },
      { status: 500 },
    );
  }
}

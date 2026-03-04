import { NextResponse } from "next/server";

import { db as prisma } from "@/lib/db";

interface CreateTicketRequest {
  productId?: string;
  issueCategory?: string | null;
  issueDescription?: string;
  issuePhotos?: string[];
  reportedByName?: string | null;
  reportedByPhone?: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function syntheticCustomerClerkId(phone: string): string {
  const normalized = phone.replace(/\D/g, "");
  if (!normalized) {
    return `customer_${crypto.randomUUID()}`;
  }

  return `customer_phone_${normalized}`;
}

async function generateTicketNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();

  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const count = await prisma.ticket.count({
    where: {
      createdAt: {
        gte: yearStart,
        lt: yearEnd,
      },
    },
  });

  return `WRT-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTicketRequest;

    if (!body.productId || !body.issueDescription || !body.reportedByPhone) {
      return NextResponse.json(
        {
          error:
            "productId, issueDescription, and reportedByPhone are required.",
        },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: {
        id: true,
        stickerId: true,
        customerId: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const existingOpenTicket = await prisma.ticket.findFirst({
      where: {
        productId: body.productId,
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
      orderBy: {
        reportedAt: "desc",
      },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
      },
    });

    if (existingOpenTicket) {
      return NextResponse.json(
        {
          error: "An open ticket already exists for this product.",
          ticket: existingOpenTicket,
        },
        { status: 409 },
      );
    }

    const normalizedPhone = normalizePhone(body.reportedByPhone);

    const userLookupFilters: Array<{ id?: string; phone?: string }> = [];

    if (product.customerId) {
      userLookupFilters.push({ id: product.customerId });
    }

    if (normalizedPhone) {
      userLookupFilters.push({ phone: normalizedPhone });
    }

    const customerUser =
      (userLookupFilters.length > 0
        ? await prisma.user.findFirst({
            where: {
              OR: userLookupFilters,
            },
            select: {
              id: true,
              name: true,
            },
          })
        : null) ??
      (await prisma.user.create({
        data: {
          clerkId: syntheticCustomerClerkId(normalizedPhone),
          role: "customer",
          name: body.reportedByName ?? "Customer",
          phone: normalizedPhone || null,
        },
        select: {
          id: true,
          name: true,
        },
      }));

    const ticketNumber = await generateTicketNumber();
    const ticketId = crypto.randomUUID();

    const [ticket] = await prisma.$transaction([
      prisma.ticket.create({
        data: {
          id: ticketId,
          ticketNumber,
          productId: product.id,
          stickerId: product.stickerId,
          reportedByUserId: customerUser.id,
          reportedByName: body.reportedByName ?? customerUser.name ?? "Customer",
          reportedByPhone: normalizedPhone,
          issueCategory: body.issueCategory ?? null,
          issueDescription: body.issueDescription,
          issuePhotos: body.issuePhotos ?? [],
          issueSeverity: "medium",
          status: "reported",
        },
      }),
      prisma.ticketTimeline.create({
        data: {
          ticketId,
          eventType: "created",
          eventDescription: "Service request created by customer.",
          actorUserId: customerUser.id,
          actorRole: "customer",
          actorName: body.reportedByName ?? customerUser.name ?? "Customer",
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        ticket,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Ticket creation failed", error);
    return NextResponse.json(
      { error: "Unable to create ticket at this time." },
      { status: 500 },
    );
  }
}

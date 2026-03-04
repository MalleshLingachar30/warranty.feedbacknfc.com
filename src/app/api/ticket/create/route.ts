import { NextResponse } from "next/server";

import { assignTechnician } from "@/lib/ai-assignment";
import { db as prisma } from "@/lib/db";
import { sendTechnicianAssignmentSms } from "@/lib/warranty-notifications";

interface CreateTicketRequest {
  productId?: string;
  issueCategory?: string | null;
  issueDescription?: string;
  issuePhotos?: string[];
  photos?: string[];
  severity?: string;
  reportedByName?: string | null;
  customerName?: string | null;
  reportedByPhone?: string;
  customerPhone?: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function normalizeSeverity(value: string | undefined) {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }

  return "medium";
}

function sanitizePhotos(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 10);
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
    const reportedByPhone = body.reportedByPhone ?? body.customerPhone;
    const reportedByName = body.reportedByName ?? body.customerName ?? null;
    const issuePhotos = sanitizePhotos(body.issuePhotos ?? body.photos ?? []);
    const issueSeverity = normalizeSeverity(body.severity);

    if (!body.productId || !body.issueDescription || !reportedByPhone) {
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
        customerCity: true,
        productModel: {
          select: {
            name: true,
          },
        },
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

    const normalizedPhone = normalizePhone(reportedByPhone);

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
          name: reportedByName ?? "Customer",
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
          reportedByName: reportedByName ?? customerUser.name ?? "Customer",
          reportedByPhone: normalizedPhone,
          issueCategory: body.issueCategory ?? null,
          issueDescription: body.issueDescription,
          issuePhotos,
          issueSeverity,
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
          actorName: reportedByName ?? customerUser.name ?? "Customer",
        },
      }),
    ]);

    let assignment:
      | {
          status: "assigned" | "escalated";
          assignedTechnicianId?: string;
          assignedServiceCenterId?: string;
          reason?: string;
        }
      | null = null;

    try {
      assignment = await assignTechnician(ticket.id);

      if (assignment.status === "assigned" && assignment.assignedTechnicianId) {
        const assignedTicket = await prisma.ticket.findUnique({
          where: { id: ticket.id },
          select: {
            ticketNumber: true,
            issueCategory: true,
            assignedTechnician: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        });

        const technicianPhone = assignedTicket?.assignedTechnician?.phone ?? "";
        const technicianName = assignedTicket?.assignedTechnician?.name ?? "";

        if (technicianPhone && technicianName) {
          void sendTechnicianAssignmentSms({
            technicianName,
            technicianPhone,
            issueCategory: assignedTicket?.issueCategory ?? "General issue",
            location: product.customerCity ?? "Customer location",
            productName: product.productModel.name,
            ticketNumber: assignedTicket?.ticketNumber ?? ticket.ticketNumber,
          });
        }
      }
    } catch (assignmentError) {
      console.error("AI assignment failed", assignmentError);
    }

    const latestTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
    });

    return NextResponse.json(
      {
        success: true,
        ticket: latestTicket ?? ticket,
        assignment,
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

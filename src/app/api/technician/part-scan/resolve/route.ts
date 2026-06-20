import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { clerkOrDbHasRole } from "@/lib/rbac";
import { resolvePartScanPayloadByReference } from "@/lib/part-scan-resolver";

export const runtime = "nodejs";

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  try {
    const authData = await auth();

    if (!authData.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleGuardDisabled =
      process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true";

    if (!roleGuardDisabled) {
      const hasRequiredRole = await clerkOrDbHasRole({
        clerkUserId: authData.userId,
        orgRole: authData.orgRole,
        sessionClaims: authData.sessionClaims,
        requiredRole: "field_technician",
      });

      if (!hasRequiredRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = (await request.json()) as {
      ticketId?: unknown;
      code?: unknown;
    };

    const ticketId = asNonEmptyString(body.ticketId);
    const code = asNonEmptyString(body.code);

    if (!ticketId || !code) {
      return NextResponse.json(
        { error: "Ticket id and scanned code are required." },
        { status: 400 },
      );
    }

    const ticket = await db.ticket.findFirst({
      where: {
        id: ticketId,
        assignedTechnician: {
          user: {
            clerkId: authData.userId,
          },
        },
      },
      select: {
        product: {
          select: {
            productModel: {
              select: {
                organizationId: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "This ticket is not assigned to your technician profile." },
        { status: 404 },
      );
    }

    const scan = await resolvePartScanPayloadByReference(db, code, {
      organizationId: ticket.product.productModel.organizationId,
    });

    if (!scan) {
      return NextResponse.json(
        {
          error:
            "The scanned part does not resolve to a known spare, small part, kit, or pack for this manufacturer.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ scan });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong while resolving this scanned part." },
      { status: 500 },
    );
  }
}

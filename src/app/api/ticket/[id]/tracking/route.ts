import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getOptionalAuth } from "@/lib/clerk-session";
import { db } from "@/lib/db";
import { authorizeOwnerAccess } from "@/lib/otp-session";
import { clerkOrDbHasRole } from "@/lib/rbac";
import { parseAppRole, parseAppRoleFromClaims } from "@/lib/roles";
import {
  applyTechnicianTrackingAction,
  normalizeTrackingLocationSample,
  TICKET_LIVE_STATUS_SELECT,
  toCustomerSafeTrackingPayload,
  type TechnicianTrackingAction,
} from "@/lib/ticket-live-tracking";

export const runtime = "nodejs";

type ViewerRole =
  | "owner"
  | "technician"
  | "service_center_admin"
  | "manufacturer_admin"
  | "super_admin"
  | "unknown";

interface TrackingRequestBody {
  action?: TechnicianTrackingAction;
  location?: unknown;
  pauseReason?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readEtaLabel(metadata: unknown): string | null {
  const record = asRecord(metadata);
  return asString(record.etaLabel);
}

function isTrackingAction(value: unknown): value is TechnicianTrackingAction {
  return (
    value === "start_tracking" ||
    value === "heartbeat" ||
    value === "arrived" ||
    value === "pause" ||
    value === "resume" ||
    value === "stop"
  );
}

function isInternalViewerRole(role: string): role is
  | "technician"
  | "service_center_admin"
  | "manufacturer_admin"
  | "super_admin" {
  return (
    role === "technician" ||
    role === "service_center_admin" ||
    role === "manufacturer_admin" ||
    role === "super_admin"
  );
}

function statusCodeForAction(action: TechnicianTrackingAction): number {
  if (action === "arrived" || action === "pause" || action === "resume") {
    return 202;
  }

  return 200;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ticketId } = await context.params;

    if (!ticketId) {
      return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
    }

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        productId: true,
        metadata: true,
        assignedTechnicianId: true,
        product: {
          select: {
            customerPhone: true,
          },
        },
        assignedTechnician: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        liveStatus: {
          select: TICKET_LIVE_STATUS_SELECT,
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const authData = await getOptionalAuth();

    const ownerAccess = await authorizeOwnerAccess({
      cookiesStore: await cookies(),
      productId: ticket.productId,
      ownerPhone: ticket.product.customerPhone,
      clerkUserId: authData.userId,
    });

    let viewerRole: ViewerRole = ownerAccess.valid ? "owner" : "unknown";
    let canRead = ownerAccess.valid;

    if (authData.userId) {
      const [dbUser, inferredRole] = await Promise.all([
        db.user.findUnique({
          where: { clerkId: authData.userId },
          select: {
            role: true,
            technicianProfile: {
              select: {
                id: true,
              },
            },
          },
        }),
        Promise.resolve(parseAppRoleFromClaims(authData.sessionClaims)),
      ]);

      const effectiveRole =
        inferredRole === "customer" && dbUser?.role && dbUser.role !== "customer"
          ? parseAppRole(dbUser.role)
          : inferredRole;

      if (isInternalViewerRole(effectiveRole)) {
        if (effectiveRole === "technician") {
          const isAssignedViewer =
            Boolean(ticket.assignedTechnicianId) &&
            dbUser?.technicianProfile?.id === ticket.assignedTechnicianId;

          if (isAssignedViewer) {
            canRead = true;
            viewerRole = "technician";
          }
        } else {
          canRead = true;
          viewerRole = effectiveRole;
        }
      }
    }

    if (!canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const revealTravelMetrics =
      viewerRole === "owner" &&
      (ticket.status === "technician_enroute" || ticket.status === "work_in_progress");

    const tracking = toCustomerSafeTrackingPayload({
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      ticketEtaLabel: readEtaLabel(ticket.metadata),
      liveStatus: ticket.liveStatus,
      technicianName: ticket.assignedTechnician?.name ?? null,
      technicianPhone: ticket.assignedTechnician?.phone ?? null,
      revealTravelMetrics,
    });

    return NextResponse.json({
      tracking,
      viewer: {
        role: viewerRole,
        ownerVerified: ownerAccess.valid,
      },
    });
  } catch (error) {
    console.error("Failed to fetch ticket tracking", error);
    return NextResponse.json(
      { error: "Unable to fetch ticket tracking." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authData = await getOptionalAuth();

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
        requiredRole: "technician",
      });

      if (!hasRequiredRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { id: ticketId } = await context.params;

    if (!ticketId) {
      return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as TrackingRequestBody;

    if (!isTrackingAction(body.action)) {
      return NextResponse.json(
        { error: "A valid tracking action is required." },
        { status: 400 },
      );
    }

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        productId: true,
        metadata: true,
        assignedTechnicianId: true,
        assignedServiceCenterId: true,
        product: {
          select: {
            installationLocation: true,
          },
        },
        liveStatus: {
          select: TICKET_LIVE_STATUS_SELECT,
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const technician = await db.technician.findFirst({
      where: {
        user: {
          clerkId: authData.userId,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        serviceCenterId: true,
      },
    });

    if (!technician) {
      return NextResponse.json(
        {
          error:
            "Technician profile not found for this account. Ask your service center admin to add you.",
        },
        { status: 400 },
      );
    }

    if (
      ticket.assignedTechnicianId &&
      ticket.assignedTechnicianId !== technician.id
    ) {
      return NextResponse.json(
        { error: "Ticket is assigned to another technician." },
        { status: 403 },
      );
    }

    if (
      ticket.assignedServiceCenterId &&
      ticket.assignedServiceCenterId !== technician.serviceCenterId
    ) {
      return NextResponse.json(
        { error: "Technician does not belong to the assigned service center." },
        { status: 403 },
      );
    }

    const locationSample = normalizeTrackingLocationSample(body.location);
    const pauseReason = asString(body.pauseReason);

    if (body.action === "heartbeat" && !locationSample) {
      return NextResponse.json(
        {
          error:
            "heartbeat action requires a valid location sample with latitude and longitude.",
        },
        { status: 400 },
      );
    }

    const updated = await applyTechnicianTrackingAction({
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      technicianId: technician.id,
      ticketMetadata: ticket.metadata,
      productInstallationLocation: ticket.product.installationLocation,
      existingLiveStatus: ticket.liveStatus,
      action: body.action,
      locationSample,
      pauseReason,
    });

    if (
      body.action === "arrived" ||
      body.action === "pause" ||
      body.action === "resume" ||
      body.action === "stop"
    ) {
      const eventTypeMap: Record<string, string> = {
        arrived: "technician_arrived_live",
        pause: "tracking_paused",
        resume: "tracking_resumed",
        stop: "tracking_stopped",
      };

      const eventType = eventTypeMap[body.action];

      if (eventType) {
        await db.ticketTimeline.create({
          data: {
            ticketId: ticket.id,
            eventType,
            eventDescription:
              body.action === "arrived"
                ? `${technician.name} marked arrival at customer location.`
                : body.action === "pause"
                  ? `${technician.name} paused live location sharing.`
                  : body.action === "resume"
                    ? `${technician.name} resumed live location sharing.`
                    : `${technician.name} stopped live location sharing.`,
            actorRole: "technician",
            actorName: technician.name,
          },
        });
      }
    }

    const tracking = toCustomerSafeTrackingPayload({
      ticketId: ticket.id,
      ticketStatus: ticket.status,
      ticketEtaLabel: readEtaLabel(ticket.metadata),
      liveStatus: updated,
      technicianName: technician.name,
      technicianPhone: technician.phone,
      revealTravelMetrics: false,
    });

    return NextResponse.json(
      {
        success: true,
        tracking,
      },
      { status: statusCodeForAction(body.action) },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update ticket tracking.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

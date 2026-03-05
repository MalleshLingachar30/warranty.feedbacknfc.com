import Link from "next/link";
import { notFound } from "next/navigation";
import type { TicketStatus } from "@prisma/client";
import { PhoneCall } from "lucide-react";

import { TicketResolutionActions } from "@/components/customer/ticket-resolution-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireCustomerContext } from "@/lib/customer-context";

interface TicketDetailsPageProps {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveParams(
  params: TicketDetailsPageProps["params"],
): Promise<{ id: string }> {
  const maybePromise = params as Promise<{ id: string }>;
  if (typeof maybePromise?.then === "function") {
    return maybePromise;
  }

  return params as { id: string };
}

const OPEN_OR_ACTIONABLE_STATUSES: TicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
  "resolved",
  "closed",
];

function statusLabel(status: TicketStatus) {
  return status.replace(/_/g, " ");
}

function statusClass(status: TicketStatus) {
  switch (status) {
    case "reported":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "assigned":
    case "technician_enroute":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "work_in_progress":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "pending_confirmation":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "resolved":
    case "closed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "reopened":
    case "escalated":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function readEtaLabel(metadata: unknown): string | null {
  if (!isRecord(metadata)) {
    return null;
  }

  return asString(metadata.etaLabel);
}

export default async function TicketDetailsPage({
  params,
}: TicketDetailsPageProps) {
  const resolvedParams = await resolveParams(params);
  const ticketId = resolvedParams.id;

  if (!ticketId) {
    notFound();
  }

  const { dbUserId, verifiedEmails, verifiedPhones } =
    await requireCustomerContext();

  const ownershipFilters = [
    { reportedByUserId: dbUserId },
    { product: { customerId: dbUserId } },
    ...(verifiedPhones.length > 0
      ? [
          { reportedByPhone: { in: verifiedPhones } },
          { product: { customerPhone: { in: verifiedPhones } } },
        ]
      : []),
    ...(verifiedEmails.length > 0
      ? [{ product: { customerEmail: { in: verifiedEmails } } }]
      : []),
  ];

  const ticket = await db.ticket.findFirst({
    where: {
      id: ticketId,
      AND: [
        {
          OR: ownershipFilters,
        },
        {
          status: {
            in: OPEN_OR_ACTIONABLE_STATUSES,
          },
        },
      ],
    },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      issueCategory: true,
      issueDescription: true,
      issueSeverity: true,
      reportedAt: true,
      assignedAt: true,
      technicianStartedAt: true,
      technicianCompletedAt: true,
      resolutionNotes: true,
      metadata: true,
      product: {
        select: {
          id: true,
          serialNumber: true,
          customerName: true,
          customerPhone: true,
          organization: {
            select: {
              name: true,
              contactPhone: true,
              contactEmail: true,
            },
          },
          sticker: {
            select: {
              stickerNumber: true,
            },
          },
          productModel: {
            select: {
              name: true,
              modelNumber: true,
            },
          },
        },
      },
      assignedTechnician: {
        select: {
          name: true,
          phone: true,
        },
      },
      timelineEntries: {
        orderBy: {
          createdAt: "desc",
        },
        take: 40,
        select: {
          id: true,
          eventType: true,
          eventDescription: true,
          actorName: true,
          actorRole: true,
          createdAt: true,
        },
      },
    },
  });

  if (!ticket) {
    notFound();
  }

  const stickerNumber = ticket.product.sticker.stickerNumber;
  const etaLabel = readEtaLabel(ticket.metadata);

  const canConfirm = ticket.status === "pending_confirmation";
  const canReopen =
    ticket.status === "pending_confirmation" || ticket.status === "resolved";

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.ticketNumber}
        description="Service request details and timeline."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge variant="outline" className={statusClass(ticket.status)}>
              {statusLabel(ticket.status)}
            </Badge>
            <Button size="sm" asChild>
              <Link href={`/nfc/${stickerNumber}`}>Open sticker</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Product</CardTitle>
            <CardDescription>Sticker #{stickerNumber}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p className="font-medium text-slate-900">
              {ticket.product.productModel.name}
            </p>
            <p className="text-slate-600">
              {ticket.product.productModel.modelNumber
                ? `Model ${ticket.product.productModel.modelNumber} • `
                : ""}
              {ticket.product.serialNumber
                ? `Serial ${ticket.product.serialNumber}`
                : "Serial not provided"}
            </p>
            <p className="text-slate-600">{ticket.product.organization.name}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Issue</CardTitle>
            <CardDescription>
              {ticket.issueCategory ?? "Issue"} • Severity {ticket.issueSeverity}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-slate-900">{ticket.issueDescription}</p>
            <p className="text-xs text-slate-500">
              Reported {formatDateTime(ticket.reportedAt)}
              {ticket.assignedAt ? ` • Assigned ${formatDateTime(ticket.assignedAt)}` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Technician</CardTitle>
          <CardDescription>
            {ticket.assignedTechnician
              ? "Assigned technician contact and ETA."
              : "A technician will be assigned soon."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {ticket.assignedTechnician ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-slate-900">
                {ticket.assignedTechnician.name}
              </p>
              <p className="text-slate-600">{ticket.assignedTechnician.phone}</p>
              {etaLabel ? (
                <p className="text-xs text-slate-500">ETA: {etaLabel}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Assignment is pending. You can keep tracking this ticket here or
              via the sticker page.
            </p>
          )}

          {ticket.assignedTechnician?.phone ? (
            <Button asChild variant="outline" className="gap-2">
              <a href={`tel:${ticket.assignedTechnician.phone}`}>
                <PhoneCall className="h-4 w-4" />
                Call
              </a>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {ticket.status === "pending_confirmation" || ticket.status === "resolved" ? (
        <Card className="border-indigo-200 bg-indigo-50">
          <CardHeader>
            <CardTitle className="text-base text-indigo-950">
              Confirm resolution
            </CardTitle>
            <CardDescription className="text-indigo-900/80">
              Confirm if the issue is fixed, or reopen the ticket if you still
              need help.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TicketResolutionActions
              ticketId={ticket.id}
              canConfirm={canConfirm}
              canReopen={canReopen}
            />
          </CardContent>
        </Card>
      ) : null}

      {ticket.resolutionNotes ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Resolution notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700">
            {ticket.resolutionNotes}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
          <CardDescription>Every status change and update on this ticket.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticket.timelineEntries.length === 0 ? (
            <p className="text-sm text-slate-600">No timeline events yet.</p>
          ) : (
            <ol className="space-y-3">
              {ticket.timelineEntries.map((event) => (
                <li
                  key={event.id}
                  className="rounded-md border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {event.eventType.replace(/_/g, " ")}
                      </p>
                      {event.eventDescription ? (
                        <p className="mt-1 text-sm text-slate-700">
                          {event.eventDescription}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">
                        {event.actorName
                          ? `${event.actorName}${event.actorRole ? ` (${event.actorRole})` : ""}`
                          : "System"}{" "}
                        • {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


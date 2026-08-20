import Link from "next/link";
import type {
  PreventiveMaintenanceEventStatus,
  Prisma,
  TicketStatus,
  WarrantyStatus,
} from "@prisma/client";

import { RegisterProductCard } from "@/components/customer/register-product-card";
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

const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "reported",
  "awaiting_technician_acceptance",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

const CLOSED_TICKET_STATUSES: TicketStatus[] = ["resolved", "closed"];

const VISIBLE_PM_STATUSES: PreventiveMaintenanceEventStatus[] = [
  "due",
  "scheduled",
  "in_progress",
  "completed",
];

function warrantyBadgeClass(status: WarrantyStatus) {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "pending_activation":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "expired":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "extended":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "voided":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function warrantyLabel(status: WarrantyStatus) {
  return status.replace(/_/g, " ");
}

function ticketStatusLabel(status: TicketStatus) {
  return status.replace(/_/g, " ");
}

function ticketBadgeClass(status: TicketStatus) {
  switch (status) {
    case "reported":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "awaiting_technician_acceptance":
      return "border-sky-200 bg-sky-50 text-sky-700";
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

function pmStatusBadgeClass(status: PreventiveMaintenanceEventStatus) {
  switch (status) {
    case "due":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "scheduled":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "in_progress":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function daysUntil(date: Date) {
  const now = Date.now();
  const then = date.getTime();
  return Math.max(0, Math.ceil((then - now) / (1000 * 60 * 60 * 24)));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getCalendarStart(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  return addDays(firstDay, -mondayOffset);
}

function getVisitDate(event: {
  dueDate: Date;
  scheduledFor: Date | null;
  completedAt: Date | null;
}) {
  return event.scheduledFor ?? event.completedAt ?? event.dueDate;
}

function visitTimingLabel(event: {
  dueDate: Date;
  scheduledFor: Date | null;
  completedAt: Date | null;
}) {
  if (event.completedAt) {
    return `Completed ${formatDate(event.completedAt)}`;
  }

  if (event.scheduledFor) {
    return `Scheduled ${formatDate(event.scheduledFor)}`;
  }

  return `Due ${formatDate(event.dueDate)}`;
}

function maintenanceStatusLabel(status: PreventiveMaintenanceEventStatus) {
  switch (status) {
    case "due":
      return "Due";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "overdue":
      return "Overdue";
    default:
      return "Visit status";
  }
}

export default async function CustomerDashboardPage() {
  const { dbUserId, verifiedEmails, verifiedPhones } =
    await requireCustomerContext();

  const customerFilters = [
    { customerId: dbUserId },
    ...(verifiedPhones.length > 0 ? [{ customerPhone: { in: verifiedPhones } }] : []),
    ...(verifiedEmails.length > 0 ? [{ customerEmail: { in: verifiedEmails } }] : []),
  ];

  const ticketOwnershipFilters: Prisma.TicketWhereInput[] = [
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

  const [products, openCount, closedCount, recentTickets] = await Promise.all([
    db.product.findMany({
      where: {
        OR: customerFilters,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
      select: {
        id: true,
        organizationId: true,
        productModelId: true,
        serialNumber: true,
        warrantyStatus: true,
        warrantyEndDate: true,
        productModel: {
          select: {
            name: true,
            modelNumber: true,
          },
        },
        sticker: {
          select: {
            stickerNumber: true,
          },
        },
        tickets: {
          where: {
            status: {
              in: OPEN_TICKET_STATUSES,
            },
          },
          orderBy: {
            reportedAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            ticketNumber: true,
            status: true,
            issueDescription: true,
            reportedAt: true,
          },
        },
      },
    }),
    db.ticket.count({
      where: {
        OR: ticketOwnershipFilters,
        status: {
          in: OPEN_TICKET_STATUSES,
        },
      },
    }),
    db.ticket.count({
      where: {
        OR: ticketOwnershipFilters,
        status: {
          in: CLOSED_TICKET_STATUSES,
        },
      },
    }),
    db.ticket.findMany({
      where: {
        OR: ticketOwnershipFilters,
      },
      orderBy: {
        reportedAt: "desc",
      },
      take: 5,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        issueCategory: true,
        reportedAt: true,
        product: {
          select: {
            sticker: {
              select: {
                stickerNumber: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const assetProductClauses: Prisma.PreventiveMaintenanceEventWhereInput[] =
    products
      .filter((product) => Boolean(product.serialNumber))
      .map((product) => ({
        asset: {
          organizationId: product.organizationId,
          productModelId: product.productModelId,
          serialNumber: product.serialNumber,
        },
      }));

  const pmEvents = await db.preventiveMaintenanceEvent.findMany({
    where: {
      status: {
        in: VISIBLE_PM_STATUSES,
      },
      OR: [
        {
          asset: {
            customerId: dbUserId,
          },
        },
        ...assetProductClauses,
      ],
    },
    orderBy: [
      {
        dueDate: "asc",
      },
      {
        eventNumber: "asc",
      },
    ],
    take: 200,
    select: {
      id: true,
      eventNumber: true,
      eventType: true,
      status: true,
      dueDate: true,
      scheduledFor: true,
      completedAt: true,
      asset: {
        select: {
          publicCode: true,
          productModel: {
            select: {
              name: true,
              modelNumber: true,
            },
          },
        },
      },
      assignedServiceCenter: {
        select: {
          name: true,
          city: true,
        },
      },
      assignedTechnician: {
        select: {
          name: true,
        },
      },
    },
  });

  const upcomingPmEvents = pmEvents
    .filter((event) => event.status !== "completed")
    .sort(
      (left, right) =>
        getVisitDate(left).getTime() - getVisitDate(right).getTime(),
    );
  const calendarAnchor = getVisitDate(upcomingPmEvents[0] ?? pmEvents[0] ?? {
    dueDate: new Date(),
    scheduledFor: null,
    completedAt: null,
  });
  const calendarStart = getCalendarStart(
    new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), 1),
  );
  const customerCalendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(calendarStart, index);

    return {
      date,
      isCurrentMonth: date.getMonth() === calendarAnchor.getMonth(),
      visits: pmEvents.filter((event) =>
        isSameDay(getVisitDate(event), date),
      ),
    };
  });
  const nextPmVisit = upcomingPmEvents[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Dashboard"
        description="My Products, My Tickets, and Support in one place."
      />

      <RegisterProductCard />

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">My Products</CardTitle>
            <CardDescription>
              Registered products with warranty status, quick sticker access, and certificate download.
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard/my-products">View all products</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-slate-600">
              No products linked yet. Scan a sticker to activate and register your product.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((product) => {
                const stickerNumber = product.sticker.stickerNumber;
                const openTicket = product.tickets[0] ?? null;
                const remainingDays =
                  product.warrantyEndDate instanceof Date
                    ? daysUntil(product.warrantyEndDate)
                    : null;

                return (
                  <div key={product.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">
                          {product.productModel.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {product.productModel.modelNumber
                            ? `Model ${product.productModel.modelNumber} • `
                            : ""}
                          {product.serialNumber
                            ? `Serial ${product.serialNumber} • `
                            : ""}
                          Sticker #{stickerNumber}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={warrantyBadgeClass(product.warrantyStatus)}
                      >
                        {warrantyLabel(product.warrantyStatus)}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/sticker/${stickerNumber}/qr`}
                        alt={`QR for sticker ${stickerNumber}`}
                        className="h-20 w-20 rounded-md border border-slate-200 bg-white p-1"
                      />
                      <div className="text-xs text-slate-600">
                        <p>Scan QR to reopen this product page.</p>
                        {product.warrantyEndDate ? (
                          <p className="mt-1">
                            Expires {formatDate(product.warrantyEndDate)}
                            {remainingDays !== null
                              ? ` • ${remainingDays} day${remainingDays === 1 ? "" : "s"} left`
                              : ""}
                          </p>
                        ) : (
                          <p className="mt-1">Warranty dates appear after activation.</p>
                        )}
                      </div>
                    </div>

                    {openTicket ? (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2">
                        <p className="text-xs font-medium text-amber-900">
                          Open ticket {openTicket.ticketNumber}
                        </p>
                        <p className="text-xs text-amber-800">
                          {ticketStatusLabel(openTicket.status)} •{" "}
                          {formatDate(openTicket.reportedAt)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-amber-900">
                          {openTicket.issueDescription}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link href={`/nfc/${stickerNumber}`}>Open sticker</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={`/api/products/${product.id}/certificate?download=1`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Certificate
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">My Tickets</CardTitle>
            <CardDescription>
              Live ticket tracking and recent history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                Open {openCount}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                Closed {closedCount}
              </Badge>
            </div>

            {recentTickets.length === 0 ? (
              <p className="text-sm text-slate-600">No tickets created yet.</p>
            ) : (
              <div className="space-y-2">
                {recentTickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-md border border-slate-200 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {ticket.ticketNumber}
                        </p>
                        <p className="text-xs text-slate-500">
                          {ticket.issueCategory ?? "Issue"} • {formatDate(ticket.reportedAt)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={ticketBadgeClass(ticket.status)}
                      >
                        {ticketStatusLabel(ticket.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard/my-tickets/${ticket.id}`}>View</Link>
                      </Button>
                      <Button size="sm" asChild>
                        <Link href={`/nfc/${ticket.product.sticker.stickerNumber}`}>
                          Sticker
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" asChild>
              <Link href="/dashboard/my-tickets">Open My Tickets</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">My Maintenance Calendar</CardTitle>
            <CardDescription>
              Upcoming service visits for your registered products.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pmEvents.length === 0 ? (
              <p className="text-sm text-slate-600">
                No maintenance visits are scheduled yet.
              </p>
            ) : (
              <>
                {nextPmVisit ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-emerald-950">
                          Next service visit
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {nextPmVisit.asset.productModel.name}
                        </p>
                        <p className="text-sm text-slate-700">
                          {visitTimingLabel(nextPmVisit)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={pmStatusBadgeClass(nextPmVisit.status)}
                      >
                        {maintenanceStatusLabel(nextPmVisit.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <p>
                        Product code:{" "}
                        <span className="font-medium text-slate-900">
                          {nextPmVisit.asset.publicCode}
                        </span>
                      </p>
                      <p>
                        Service team:{" "}
                        <span className="font-medium text-slate-900">
                          {nextPmVisit.assignedTechnician?.name ??
                            nextPmVisit.assignedServiceCenter?.name ??
                            "Will be assigned soon"}
                        </span>
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatMonth(calendarAnchor)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Calendar shows only your registered products.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-7 gap-1 text-[11px] font-semibold uppercase text-slate-500">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day) => (
                        <div key={day} className="px-1">
                          {day}
                        </div>
                      ),
                    )}
                  </div>

                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {customerCalendarDays.map((day) => (
                      <div
                        key={day.date.toISOString()}
                        className={`min-h-24 rounded-md border p-1 ${
                          day.isCurrentMonth
                            ? "border-slate-200 bg-white"
                            : "border-slate-100 bg-slate-50 text-slate-400"
                        }`}
                      >
                        <p className="text-xs font-medium">
                          {day.date.getDate()}
                        </p>
                        <div className="mt-1 space-y-1">
                          {day.visits.slice(0, 2).map((event) => (
                            <div
                              key={event.id}
                              className="rounded border border-blue-100 bg-blue-50 px-1.5 py-1 text-[10px] leading-tight text-blue-950"
                            >
                              <p className="truncate font-medium">
                                {event.asset.productModel.name}
                              </p>
                              <p className="truncate">
                                {maintenanceStatusLabel(event.status)}
                              </p>
                            </div>
                          ))}
                          {day.visits.length > 2 ? (
                            <p className="text-[10px] text-slate-500">
                              +{day.visits.length - 2} more
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {pmEvents.slice(0, 4).map((event) => (
                    <div
                      key={event.id}
                      className="rounded-md border border-slate-200 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {event.asset.productModel.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {event.asset.publicCode}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={pmStatusBadgeClass(event.status)}
                        >
                          {maintenanceStatusLabel(event.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {visitTimingLabel(event)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.assignedTechnician?.name ??
                          event.assignedServiceCenter?.name ??
                          "Service team will be assigned soon"}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
            <Button variant="outline" asChild>
              <Link href="/dashboard/my-products">Open My Products</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Support</CardTitle>
            <CardDescription>
              Contact manufacturer support, FAQs, and warranty documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-600">
              Use Support for manufacturer contacts and service help.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/support">Open Support</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/my-products">My Products</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

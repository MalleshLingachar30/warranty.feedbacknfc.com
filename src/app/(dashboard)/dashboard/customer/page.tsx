import Link from "next/link";
import type { Prisma, TicketStatus, WarrantyStatus } from "@prisma/client";

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
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

const CLOSED_TICKET_STATUSES: TicketStatus[] = ["resolved", "closed"];

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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysUntil(date: Date) {
  const now = Date.now();
  const then = date.getTime();
  return Math.max(0, Math.ceil((then - now) / (1000 * 60 * 60 * 24)));
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

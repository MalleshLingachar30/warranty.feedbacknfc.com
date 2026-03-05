import Link from "next/link";

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
import type { WarrantyStatus, TicketStatus } from "@prisma/client";

const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

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
  return Math.ceil((then - now) / (1000 * 60 * 60 * 24));
}

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

export default async function MyProductsPage() {
  const { dbUserId, verifiedEmails, verifiedPhones } =
    await requireCustomerContext();

  const customerFilters = [
    { customerId: dbUserId },
    ...(verifiedPhones.length > 0 ? [{ customerPhone: { in: verifiedPhones } }] : []),
    ...(verifiedEmails.length > 0 ? [{ customerEmail: { in: verifiedEmails } }] : []),
  ];

  const products = await db.product.findMany({
    where: {
      OR: customerFilters,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
    select: {
      id: true,
      serialNumber: true,
      warrantyStatus: true,
      warrantyStartDate: true,
      warrantyEndDate: true,
      customerName: true,
      organization: {
        select: {
          name: true,
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
          imageUrl: true,
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
          issueCategory: true,
          issueDescription: true,
          reportedAt: true,
        },
      },
      _count: {
        select: {
          tickets: true,
        },
      },
    },
  });

  const hasVerifiedContact = verifiedPhones.length > 0 || verifiedEmails.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Products"
        description="View warranty coverage and open sticker pages for service."
      />

      {!hasVerifiedContact ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">
              Verify your phone or email
            </CardTitle>
            <CardDescription className="text-amber-800">
              We can only link products to your portal using verified contact
              info. Add/verify a phone number or email in your account, then
              reload this page.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <RegisterProductCard />

      {products.length === 0 ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>No products yet</CardTitle>
            <CardDescription>
              Scan your product sticker (QR/NFC) to activate warranty or submit
              a service request. Once activated, products appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((product) => {
            const stickerNumber = product.sticker.stickerNumber;
            const openTicket = product.tickets[0] ?? null;
            const warrantyEndDate = product.warrantyEndDate;
            const remainingDays =
              warrantyEndDate instanceof Date ? daysUntil(warrantyEndDate) : null;

            return (
              <Card key={product.id} className="border-slate-200">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {product.productModel.name}
                      </CardTitle>
                      <CardDescription>
                        {product.productModel.modelNumber
                          ? `Model ${product.productModel.modelNumber} • `
                          : ""}
                        {product.serialNumber
                          ? `Serial ${product.serialNumber} • `
                          : ""}
                        Sticker #{stickerNumber}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className={warrantyBadgeClass(product.warrantyStatus)}
                    >
                      {warrantyLabel(product.warrantyStatus)}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="text-sm text-slate-600">
                    <p className="font-medium text-slate-800">
                      {product.organization.name}
                    </p>
                    {warrantyEndDate ? (
                      <p>
                        Warranty ends on{" "}
                        <span className="font-medium text-slate-800">
                          {formatDate(warrantyEndDate)}
                        </span>
                        {remainingDays !== null ? (
                          <>
                            {" "}
                            •{" "}
                            <span className="font-medium text-slate-800">
                              {remainingDays}
                            </span>{" "}
                            day{remainingDays === 1 ? "" : "s"} remaining
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p>Warranty dates will appear after activation.</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {product._count.tickets} service ticket
                      {product._count.tickets === 1 ? "" : "s"} recorded
                    </p>
                  </div>

                  {openTicket ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-amber-900">
                            Open ticket #{openTicket.ticketNumber}
                          </p>
                          <p className="text-xs text-amber-800">
                            {openTicket.issueCategory ?? "Issue"} •{" "}
                            {formatDate(openTicket.reportedAt)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={ticketBadgeClass(openTicket.status)}
                        >
                          {ticketStatusLabel(openTicket.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-amber-900">
                        {openTicket.issueDescription}
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button size="sm" asChild>
                          <Link href={`/dashboard/my-tickets/${openTicket.id}`}>
                            View ticket
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/nfc/${stickerNumber}`}>Open sticker</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild>
                      <Link href={`/nfc/${stickerNumber}`}>Open sticker</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/dashboard/my-tickets?product=${product.id}`}>
                        View tickets
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

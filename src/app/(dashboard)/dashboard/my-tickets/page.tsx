import Link from "next/link";
import type { Prisma, TicketStatus } from "@prisma/client";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireCustomerContext } from "@/lib/customer-context";

interface MyTicketsPageProps {
  searchParams?: Promise<{ status?: string; product?: string }>;
}

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

export default async function MyTicketsPage({ searchParams }: MyTicketsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const statusParam = resolvedSearchParams?.status === "closed" ? "closed" : "open";
  const productParam =
    typeof resolvedSearchParams?.product === "string"
      ? resolvedSearchParams.product.trim()
      : "";

  const { dbUserId, verifiedEmails, verifiedPhones } =
    await requireCustomerContext();

  const ownershipFilters: Prisma.TicketWhereInput[] = [
    { reportedByUserId: dbUserId },
    { product: { customerId: dbUserId } },
  ];

  if (verifiedPhones.length > 0) {
    ownershipFilters.push(
      { reportedByPhone: { in: verifiedPhones } },
      { product: { customerPhone: { in: verifiedPhones } } },
    );
  }

  if (verifiedEmails.length > 0) {
    ownershipFilters.push({ product: { customerEmail: { in: verifiedEmails } } });
  }

  const baseWhere: Prisma.TicketWhereInput = {
    AND: [
      {
        OR: ownershipFilters,
      },
      ...(productParam ? [{ productId: productParam }] : []),
    ],
  };

  const statusFilters =
    statusParam === "closed"
      ? { status: { in: CLOSED_TICKET_STATUSES } }
      : { status: { in: OPEN_TICKET_STATUSES } };

  const [tickets, openCount, closedCount] = await Promise.all([
    db.ticket.findMany({
      where: {
        ...baseWhere,
        ...statusFilters,
      },
      orderBy: {
        reportedAt: "desc",
      },
      take: 200,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        issueCategory: true,
        issueDescription: true,
        issueSeverity: true,
        reportedAt: true,
        product: {
          select: {
            id: true,
            serialNumber: true,
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
      },
    }),
    db.ticket.count({
      where: {
        ...baseWhere,
        status: {
          in: OPEN_TICKET_STATUSES,
        },
      },
    }),
    db.ticket.count({
      where: {
        ...baseWhere,
        status: {
          in: CLOSED_TICKET_STATUSES,
        },
      },
    }),
  ]);

  const openHref = `/dashboard/my-tickets?status=open${
    productParam ? `&product=${encodeURIComponent(productParam)}` : ""
  }`;
  const closedHref = `/dashboard/my-tickets?status=closed${
    productParam ? `&product=${encodeURIComponent(productParam)}` : ""
  }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Tickets"
        description="Track service requests, technician progress, and confirmations."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={statusParam === "open" ? "default" : "outline"}
              asChild
            >
              <Link href={openHref}>Open ({openCount})</Link>
            </Button>
            <Button
              size="sm"
              variant={statusParam === "closed" ? "default" : "outline"}
              asChild
            >
              <Link href={closedHref}>Closed ({closedCount})</Link>
            </Button>
            {productParam ? (
              <Button size="sm" variant="ghost" asChild>
                <Link href="/dashboard/my-tickets">Clear filter</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {tickets.length === 0 ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>No tickets found</CardTitle>
            <CardDescription>
              Open a product sticker page to report an issue and create a
              service request.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/my-products">Go to products</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">
              {statusParam === "closed" ? "Closed tickets" : "Open tickets"}
            </CardTitle>
            <CardDescription>
              {productParam
                ? "Filtered to a single product."
                : "Showing tickets linked to your verified phone/email and account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="whitespace-nowrap">
                        <p className="font-medium text-slate-900">
                          {ticket.ticketNumber}
                        </p>
                        <p className="text-xs text-slate-500">
                          {ticket.issueCategory ?? "Issue"} • {ticket.issueSeverity}
                        </p>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <p className="font-medium text-slate-900">
                          {ticket.product.productModel.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Sticker #{ticket.product.sticker.stickerNumber}
                          {ticket.product.serialNumber
                            ? ` • Serial ${ticket.product.serialNumber}`
                            : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusClass(ticket.status)}
                        >
                          {statusLabel(ticket.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-600">
                        {formatDateTime(ticket.reportedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/dashboard/my-tickets/${ticket.id}`}>
                              View
                            </Link>
                          </Button>
                          <Button size="sm" asChild>
                            <Link
                              href={`/nfc/${ticket.product.sticker.stickerNumber}`}
                            >
                              Sticker
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

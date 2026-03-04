import { CircleCheckBig, CircleDollarSign, CircleOff, ClipboardList } from "lucide-react";
import { type ClaimStatus } from "@prisma/client";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
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

import {
  decimalToNumber,
  resolveServiceCenterPageContext,
} from "../_lib/service-center-context";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function statusLabel(status: ClaimStatus) {
  return status.replace(/_/g, " ");
}

function statusClass(status: ClaimStatus) {
  switch (status) {
    case "auto_generated":
    case "submitted":
    case "under_review":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "paid":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "disputed":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "closed":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default async function ServiceCenterClaimsPage() {
  const { organizationId } = await resolveServiceCenterPageContext();

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const [claims, aggregate] = await Promise.all([
    db.warrantyClaim.findMany({
      where: {
        serviceCenterOrgId: organizationId,
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: 150,
      select: {
        id: true,
        claimNumber: true,
        status: true,
        totalClaimAmount: true,
        approvedAmount: true,
        rejectionReason: true,
        submittedAt: true,
        createdAt: true,
        ticket: {
          select: {
            ticketNumber: true,
          },
        },
        product: {
          select: {
            serialNumber: true,
            productModel: {
              select: {
                name: true,
                modelNumber: true,
              },
            },
          },
        },
        manufacturerOrg: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.warrantyClaim.groupBy({
      by: ["status"],
      where: {
        serviceCenterOrgId: organizationId,
      },
      _count: {
        _all: true,
      },
      _sum: {
        totalClaimAmount: true,
        approvedAmount: true,
      },
    }),
  ]);

  const pendingCount = aggregate
    .filter((entry) =>
      ["auto_generated", "submitted", "under_review"].includes(entry.status),
    )
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const approvedCount = aggregate
    .filter((entry) => entry.status === "approved")
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const rejectedCount = aggregate
    .filter((entry) => entry.status === "rejected")
    .reduce((sum, entry) => sum + entry._count._all, 0);
  const paidAmount = aggregate
    .filter((entry) => entry.status === "paid")
    .reduce(
      (sum, entry) => sum + decimalToNumber(entry._sum.approvedAmount ?? 0),
      0,
    );

  return (
    <div>
      <PageHeader
        title="Claims"
        description="View claim pipeline and reimbursement outcomes for this service-center organization."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Pending Review"
          value={pendingCount.toLocaleString()}
          description="Auto-generated/submitted/under review"
          icon={ClipboardList}
        />
        <MetricCard
          title="Approved"
          value={approvedCount.toLocaleString()}
          description="Approved by manufacturer"
          icon={CircleCheckBig}
        />
        <MetricCard
          title="Rejected"
          value={rejectedCount.toLocaleString()}
          description="Claims rejected with reason"
          icon={CircleOff}
        />
        <MetricCard
          title="Paid Amount"
          value={money.format(paidAmount)}
          description="Total reimbursed claims"
          icon={CircleDollarSign}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Claims Snapshot</CardTitle>
          <CardDescription>
            Latest claim outcomes and manufacturer review decisions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No claims have been generated for this service-center
                    organization yet.
                  </TableCell>
                </TableRow>
              ) : (
                claims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium">
                      {claim.claimNumber}
                    </TableCell>
                    <TableCell>{claim.ticket.ticketNumber}</TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{claim.product.productModel.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {claim.product.productModel.modelNumber
                            ? `${claim.product.productModel.modelNumber} • `
                            : ""}
                          {claim.product.serialNumber ?? "Serial unavailable"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{claim.manufacturerOrg.name}</TableCell>
                    <TableCell>{money.format(decimalToNumber(claim.totalClaimAmount))}</TableCell>
                    <TableCell>
                      {claim.approvedAmount === null
                        ? "-"
                        : money.format(decimalToNumber(claim.approvedAmount))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${statusClass(claim.status)}`}
                      >
                        {statusLabel(claim.status)}
                      </Badge>
                      {claim.rejectionReason ? (
                        <p className="mt-1 max-w-64 text-xs text-rose-700">
                          {claim.rejectionReason}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {(claim.submittedAt ?? claim.createdAt).toLocaleDateString(
                        "en-IN",
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

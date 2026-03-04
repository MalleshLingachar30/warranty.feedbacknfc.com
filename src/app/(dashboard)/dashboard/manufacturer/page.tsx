import {
  AlertTriangleIcon,
  BoxesIcon,
  CircleDollarSignIcon,
  TicketIcon,
} from "lucide-react";
import { type TicketStatus } from "@prisma/client";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { OverviewCharts } from "@/components/manufacturer/overview-charts";
import {
  type TicketStatusSummary,
  type TopIssueRow,
} from "@/components/manufacturer/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import {
  monthlyWarrantyCostTrend,
  topIssueByModel,
} from "@/lib/mock/manufacturer-dashboard";

import {
  decimalToNumber,
  resolveManufacturerPageContext,
} from "./_lib/server-context";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

const PENDING_CLAIM_STATUSES = [
  "auto_generated",
  "submitted",
  "under_review",
] as const;

const statusTemplate: TicketStatusSummary[] = [
  { status: "new", label: "New", count: 0 },
  { status: "assigned", label: "Assigned", count: 0 },
  { status: "in_progress", label: "In Progress", count: 0 },
  { status: "awaiting_parts", label: "Awaiting Parts", count: 0 },
];

function bucketOpenStatus(status: TicketStatus) {
  switch (status) {
    case "reported":
    case "reopened":
      return "new" as const;
    case "assigned":
    case "technician_enroute":
      return "assigned" as const;
    case "work_in_progress":
      return "in_progress" as const;
    case "pending_confirmation":
    case "escalated":
      return "awaiting_parts" as const;
    default:
      return null;
  }
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function buildMonthBuckets(months: number) {
  const now = new Date();
  const output: Array<{
    key: string;
    label: string;
  }> = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    output.push({
      key: monthKey(current),
      label: monthLabel(current),
    });
  }

  return output;
}

export default async function ManufacturerOverviewPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  const ticketStatus = statusTemplate.map((entry) => ({ ...entry }));

  let activeProductsCount = 0;
  let openTicketsCount = 0;
  let pendingClaimsCount = 0;
  let pendingClaimAmount = 0;
  let topIssues: TopIssueRow[] = [...topIssueByModel];
  let monthlyTrend = [...monthlyWarrantyCostTrend];

  if (organizationId) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      activeProducts,
      openTicketGroups,
      pendingClaims,
      claimsForTrend,
      issueTickets,
    ] = await Promise.all([
      db.product.count({
        where: {
          organizationId,
          warrantyStatus: "active",
        },
      }),
      db.ticket.groupBy({
        by: ["status"],
        where: {
          status: {
            in: OPEN_TICKET_STATUSES,
          },
          product: {
            organizationId,
          },
        },
        _count: {
          _all: true,
        },
      }),
      db.warrantyClaim.aggregate({
        where: {
          manufacturerOrgId: organizationId,
          status: {
            in: [...PENDING_CLAIM_STATUSES],
          },
        },
        _count: {
          _all: true,
        },
        _sum: {
          totalClaimAmount: true,
        },
      }),
      db.warrantyClaim.findMany({
        where: {
          manufacturerOrgId: organizationId,
          createdAt: {
            gte: sixMonthsAgo,
          },
        },
        select: {
          createdAt: true,
          totalClaimAmount: true,
        },
      }),
      db.ticket.findMany({
        where: {
          product: {
            organizationId,
          },
          issueCategory: {
            not: null,
          },
        },
        select: {
          issueCategory: true,
          product: {
            select: {
              productModel: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        take: 5000,
        orderBy: {
          reportedAt: "desc",
        },
      }),
    ]);

    activeProductsCount = activeProducts;
    pendingClaimsCount = pendingClaims._count._all;
    pendingClaimAmount = decimalToNumber(pendingClaims._sum.totalClaimAmount);

    for (const group of openTicketGroups) {
      const bucket = bucketOpenStatus(group.status);
      if (!bucket) {
        continue;
      }

      const target = ticketStatus.find((entry) => entry.status === bucket);
      if (!target) {
        continue;
      }

      target.count += group._count._all;
    }

    openTicketsCount = ticketStatus.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    if (claimsForTrend.length > 0) {
      const monthBuckets = buildMonthBuckets(6);
      const points = new Map(
        monthBuckets.map((bucket) => [
          bucket.key,
          {
            month: bucket.label,
            cost: 0,
            claims: 0,
          },
        ]),
      );

      for (const claim of claimsForTrend) {
        const key = monthKey(claim.createdAt);
        const point = points.get(key);

        if (!point) {
          continue;
        }

        point.cost += decimalToNumber(claim.totalClaimAmount);
        point.claims += 1;
      }

      monthlyTrend = [...points.values()];
    }

    const issueMap = new Map<string, TopIssueRow>();

    for (const ticket of issueTickets) {
      const issue = (ticket.issueCategory ?? "Unknown issue").trim();
      const model = ticket.product.productModel.name;
      const key = `${model}::${issue}`;

      const existing = issueMap.get(key);
      if (existing) {
        existing.incidents += 1;
      } else {
        issueMap.set(key, {
          model,
          issue,
          incidents: 1,
        });
      }
    }

    if (issueMap.size > 0) {
      topIssues = [...issueMap.values()]
        .sort((a, b) => b.incidents - a.incidents)
        .slice(0, 6);
    }
  }

  const topIssueIncidents = topIssues.reduce(
    (sum, issue) => sum + issue.incidents,
    0,
  );

  return (
    <div>
      <PageHeader
        title="Manufacturer Overview"
        description="Monitor warranty exposure, service load, and claim pipeline."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Active Products Under Warranty"
          value={activeProductsCount.toLocaleString()}
          description="Total registered active product units"
          icon={BoxesIcon}
        />
        <MetricCard
          title="Open Service Tickets"
          value={openTicketsCount.toLocaleString()}
          description="Across all authorized service centers"
          icon={TicketIcon}
        />
        <MetricCard
          title="Pending Warranty Claims"
          value={pendingClaimsCount.toLocaleString()}
          description={`${money.format(pendingClaimAmount)} awaiting review`}
          icon={CircleDollarSignIcon}
        />
        <MetricCard
          title="Top Issue Incidents"
          value={topIssueIncidents.toLocaleString()}
          description="Recurring issue reports in the current view"
          icon={AlertTriangleIcon}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <OverviewCharts monthlyTrend={monthlyTrend} topIssues={topIssues} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Open Ticket Breakdown</CardTitle>
          <CardDescription>Service ticket volume by status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ticketStatus.map((item) => (
            <div
              key={item.status}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{item.label}</p>
                <StatusBadge tone={item.status}>{item.label}</StatusBadge>
              </div>
              <p className="text-xl font-semibold">
                {item.count.toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

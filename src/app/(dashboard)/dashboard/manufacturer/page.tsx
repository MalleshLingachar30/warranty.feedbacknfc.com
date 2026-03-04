"use client"

import {
  AlertTriangleIcon,
  BoxesIcon,
  CircleDollarSignIcon,
  TicketIcon,
} from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { MetricCard } from "@/components/dashboard/metric-card"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusBadge } from "@/components/dashboard/status-badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  claimsSeed,
  monthlyWarrantyCostTrend,
  openTicketStatusCounts,
  productCatalogSeed,
  topIssueByModel,
} from "@/lib/mock/manufacturer-dashboard"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export default function ManufacturerOverviewPage() {
  const activeProductsCount = productCatalogSeed.reduce(
    (sum, model) => sum + model.totalUnits,
    0
  )

  const pendingClaims = claimsSeed.filter(
    (claim) => claim.status === "submitted" || claim.status === "under_review"
  )

  const pendingClaimAmount = pendingClaims.reduce(
    (sum, claim) => sum + claim.amount,
    0
  )

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
          value={openTicketStatusCounts
            .reduce((sum, status) => sum + status.count, 0)
            .toLocaleString()}
          description="Across all authorized service centers"
          icon={TicketIcon}
        />
        <MetricCard
          title="Pending Warranty Claims"
          value={pendingClaims.length.toLocaleString()}
          description={`${money.format(pendingClaimAmount)} awaiting review`}
          icon={CircleDollarSignIcon}
        />
        <MetricCard
          title="Top Issue Incidents"
          value={topIssueByModel
            .reduce((sum, issue) => sum + issue.incidents, 0)
            .toLocaleString()}
          description="Current month major issue reports"
          icon={AlertTriangleIcon}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Warranty Cost Trend</CardTitle>
            <CardDescription>
              Service claim amount trend over the last 6 months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
              <ResponsiveContainer>
                <LineChart data={monthlyWarrantyCostTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" />
                  <YAxis
                    tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value) => money.format(Number(value ?? 0))}
                    labelClassName="font-medium"
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--primary)" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open Ticket Breakdown</CardTitle>
            <CardDescription>Service ticket volume by status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openTicketStatusCounts.map((item) => (
              <div
                key={item.status}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <StatusBadge tone={item.status}>{item.label}</StatusBadge>
                </div>
                <p className="text-xl font-semibold">{item.count}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Top Issues by Product Model</CardTitle>
          <CardDescription>
            Highest recurring warranty issues in the current period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Model</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topIssueByModel.map((item) => (
                <TableRow key={`${item.model}-${item.issue}`}>
                  <TableCell className="font-medium">{item.model}</TableCell>
                  <TableCell>{item.issue}</TableCell>
                  <TableCell className="text-right">{item.incidents}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

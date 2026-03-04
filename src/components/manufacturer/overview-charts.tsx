"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { type MonthlyWarrantyCostPoint, type TopIssueRow } from "./types";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type OverviewChartsProps = {
  monthlyTrend: MonthlyWarrantyCostPoint[];
  topIssues: TopIssueRow[];
};

function shortenModelName(model: string) {
  if (model.length <= 20) {
    return model;
  }

  return `${model.slice(0, 18)}...`;
}

export function OverviewCharts({
  monthlyTrend,
  topIssues,
}: OverviewChartsProps) {
  return (
    <>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Monthly Warranty Cost Trend</CardTitle>
          <CardDescription>
            Claim spend and volume over the past months.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <LineChart data={monthlyTrend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis dataKey="month" />
                <YAxis
                  tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "cost") {
                      return money.format(Number(value ?? 0));
                    }

                    return Number(value ?? 0).toLocaleString();
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--primary)" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Issues by Model</CardTitle>
          <CardDescription>
            Highest recurring issue categories by product model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <BarChart
                data={topIssues}
                layout="vertical"
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  dataKey="model"
                  type="category"
                  width={120}
                  tickFormatter={(value) => shortenModelName(String(value))}
                />
                <Tooltip
                  formatter={(value) => Number(value ?? 0).toLocaleString()}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as
                      | TopIssueRow
                      | undefined;
                    if (!row) {
                      return String(label);
                    }

                    return `${row.model} - ${row.issue}`;
                  }}
                />
                <Bar
                  dataKey="incidents"
                  fill="var(--primary)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

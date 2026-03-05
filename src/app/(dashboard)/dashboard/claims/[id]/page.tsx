import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ClaimReviewForm } from "@/components/service-center/claim-review-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";

import {
  decimalToNumber,
  resolveServiceCenterPageContext,
} from "../../_lib/service-center-context";

type GenericRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export default async function ServiceCenterClaimReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organizationId } = await resolveServiceCenterPageContext();
  const { id } = await params;

  if (!organizationId) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No service-center organization is linked to this account.
      </div>
    );
  }

  const claim = await db.warrantyClaim.findFirst({
    where: {
      id,
      serviceCenterOrgId: organizationId,
    },
    select: {
      id: true,
      claimNumber: true,
      status: true,
      totalClaimAmount: true,
      documentation: true,
      ticket: {
        select: {
          ticketNumber: true,
          issueCategory: true,
          issueDescription: true,
          laborHours: true,
          partsUsed: true,
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
    },
  });

  if (!claim) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
        Claim not found for this service-center organization.
      </div>
    );
  }

  const documentation = isRecord(claim.documentation) ? claim.documentation : {};
  const reviewRecord = isRecord(documentation.serviceCenterReview)
    ? documentation.serviceCenterReview
    : {};
  const laborRecord = isRecord(documentation.labor) ? documentation.labor : {};
  const partsArray = Array.isArray(documentation.partsUsed)
    ? documentation.partsUsed
    : Array.isArray(claim.ticket.partsUsed)
      ? claim.ticket.partsUsed
      : [];

  const initialParts = partsArray
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const partName = asString(entry.partName) || asString(entry.name);
      if (!partName) {
        return null;
      }

      return {
        id: crypto.randomUUID(),
        partName,
        partNumber: asString(entry.partNumber),
        cost: String(asNumber(entry.cost, 0)),
        quantity: String(Math.max(1, Math.floor(asNumber(entry.quantity, 1)))),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        id: string;
        partName: string;
        partNumber: string;
        cost: string;
        quantity: string;
      } => Boolean(entry),
    );

  const initialLaborHours = asNumber(
    laborRecord.hours,
    decimalToNumber(claim.ticket.laborHours ?? 0),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Claim Review • ${claim.claimNumber}`}
        description="Review auto-generated documentation, adjust details if needed, then submit to manufacturer."
      />

      <Button variant="outline" asChild className="h-10 gap-2">
        <Link href="/dashboard/claims">
          <ArrowLeft className="h-4 w-4" />
          Back to Claims
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Claim Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">Ticket:</span>{" "}
            {claim.ticket.ticketNumber}
          </p>
          <p>
            <span className="font-medium text-slate-900">Product:</span>{" "}
            {claim.product.productModel.name}
            {claim.product.productModel.modelNumber
              ? ` (${claim.product.productModel.modelNumber})`
              : ""}
          </p>
          <p>
            <span className="font-medium text-slate-900">Serial:</span>{" "}
            {claim.product.serialNumber ?? "Not available"}
          </p>
          <p>
            <span className="font-medium text-slate-900">Issue:</span>{" "}
            {claim.ticket.issueCategory ?? "General issue"} •{" "}
            {claim.ticket.issueDescription}
          </p>
          <p>
            <span className="font-medium text-slate-900">Current Amount:</span>{" "}
            {new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            }).format(decimalToNumber(claim.totalClaimAmount))}
          </p>
          <Badge variant="outline" className="capitalize">
            {claim.status.replace(/_/g, " ")}
          </Badge>
        </CardContent>
      </Card>

      <ClaimReviewForm
        claimId={claim.id}
        claimNumber={claim.claimNumber}
        status={claim.status}
        initialNotes={asString(reviewRecord.notes)}
        initialLaborHours={initialLaborHours}
        initialParts={initialParts}
      />
    </div>
  );
}

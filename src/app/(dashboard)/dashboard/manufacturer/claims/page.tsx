import { ClaimsClient } from "@/components/manufacturer/claims-client";
import { type ClaimQueueRow } from "@/components/manufacturer/types";
import { db } from "@/lib/db";
import {
  manufacturerClaimSummarySelect,
  mapClaimSummary,
} from "@/lib/manufacturer-claim-view";
import { claimsSeed } from "@/lib/mock/manufacturer-dashboard";

import { resolveManufacturerPageContext } from "../_lib/server-context";

function mapSeedClaims(): ClaimQueueRow[] {
  return claimsSeed.map((claim) => ({
    id: claim.id,
    claimNumber: claim.claimNumber,
    ticketReference: claim.ticketReference,
    product: claim.product,
    serviceCenter: claim.serviceCenter,
    amount: claim.amount,
    approvedAmount:
      claim.status === "approved" || claim.status === "paid"
        ? claim.amount
        : null,
    status: claim.status,
    submittedDate: claim.submittedDate,
    rejectionReason:
      claim.status === "rejected" ? "Rejected by manufacturer" : null,
    documentation: {
      photos: claim.documentation.photos,
      beforePhotos: [],
      afterPhotos: [],
      timestamps: claim.documentation.timestamps,
      timeline: claim.documentation.timestamps.map((timestamp) => ({
        label: "Timeline Event",
        at: timestamp,
      })),
      partsUsed: claim.documentation.partsUsed,
      partsDetailed: claim.documentation.partsUsed.map((part) => ({
        partName: part,
        partNumber: "",
        quantity: 1,
        cost: 0,
        lineTotal: 0,
      })),
      technicianNotes: claim.documentation.technicianNotes,
      issueCategory: "General issue",
      issueDescription: "No issue description available.",
      issueSeverity: "medium",
      customer: {
        name: "Customer",
        phone: "-",
        email: null,
        address: null,
        city: null,
        state: null,
        pincode: null,
      },
      product: {
        name: claim.product,
        modelNumber: null,
        serialNumber: null,
        warrantyStartDate: null,
        warrantyEndDate: null,
      },
      costBreakdown: {
        partsCost: 0,
        laborCost: 0,
        laborHours: 0,
        totalClaimAmount: claim.amount,
        currency: "INR",
      },
      gpsLocation: null,
      claimReportUrl: null,
    },
  }));
}

export default async function ClaimsPage() {
  const { organizationId } = await resolveManufacturerPageContext();

  let claims: ClaimQueueRow[] = [];

  if (organizationId) {
    const rows = await db.warrantyClaim.findMany({
      where: {
        manufacturerOrgId: organizationId,
        status: {
          in: [
            "submitted",
            "under_review",
            "approved",
            "rejected",
            "paid",
            "disputed",
            "closed",
          ],
        },
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      select: manufacturerClaimSummarySelect,
    });

    claims = rows.map(mapClaimSummary);
  }

  if (claims.length === 0) {
    claims = mapSeedClaims();
  }

  return <ClaimsClient initialClaims={claims} />;
}

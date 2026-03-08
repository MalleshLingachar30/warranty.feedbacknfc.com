"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { ClaimQueueRow, ClaimStatusType } from "./types";

type ClaimFilter = "all" | "pending" | "approved" | "rejected" | "paid";

type ClaimsClientProps = {
  initialClaims: ClaimQueueRow[];
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
});

function statusLabel(status: ClaimStatusType) {
  switch (status) {
    case "auto_generated":
      return "Auto Generated";
    case "submitted":
      return "Submitted";
    case "under_review":
      return "Under Review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "paid":
      return "Paid";
    case "disputed":
      return "Disputed";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

function statusTone(status: ClaimStatusType) {
  if (
    status === "auto_generated" ||
    status === "disputed" ||
    status === "closed"
  ) {
    return "submitted" as const;
  }

  return status;
}

function isClaimVisible(claim: ClaimQueueRow, filter: ClaimFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "pending") {
    return claim.status === "submitted" || claim.status === "under_review";
  }

  return claim.status === filter;
}

export function ClaimsClient({ initialClaims }: ClaimsClientProps) {
  const [claims, setClaims] = useState(initialClaims);
  const [filter, setFilter] = useState<ClaimFilter>("all");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [claimDetailError, setClaimDetailError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isLoadingClaimDetail, setIsLoadingClaimDetail] = useState(false);

  const filteredClaims = useMemo(
    () => claims.filter((claim) => isClaimVisible(claim, filter)),
    [claims, filter],
  );

  const selectedClaim =
    claims.find((claim) => claim.id === selectedClaimId) ?? null;
  const selectedDocumentation = selectedClaim?.documentation ?? null;
  const selectedClaimIsDemo = selectedClaim?.isDemo === true;

  const loadClaimDetail = async (claimId: string) => {
    setClaimDetailError(null);
    setIsLoadingClaimDetail(true);

    try {
      const response = await fetch(`/api/manufacturer/claims/${claimId}`);
      const json = (await response.json()) as {
        error?: string;
        documentation?: ClaimQueueRow["documentation"];
      };

      if (!response.ok || !json.documentation) {
        throw new Error(json.error ?? "Unable to load claim details.");
      }

      const documentation = json.documentation;

      setClaims((current) =>
        current.map((claim) =>
          claim.id === claimId
            ? {
                ...claim,
                documentation,
              }
            : claim,
        ),
      );
    } catch (error) {
      setClaimDetailError(
        error instanceof Error
          ? error.message
          : "Unable to load claim details.",
      );
    } finally {
      setIsLoadingClaimDetail(false);
    }
  };

  const openClaimDetail = (claimId: string) => {
    setSelectedClaimId(claimId);
    setApprovedAmount("");
    setRejectionReason("");
    setActionError(null);
    setClaimDetailError(null);
    setIsDialogOpen(true);

    const claim = claims.find((entry) => entry.id === claimId);
    if (claim && !claim.documentation) {
      void loadClaimDetail(claimId);
    }
  };

  const approveClaim = async () => {
    if (!selectedClaim) {
      return;
    }

    if (selectedClaim.isDemo) {
      setActionError(
        "Demo claims are read-only. Create or submit a real claim to approve payouts.",
      );
      return;
    }

    setActionError(null);
    setIsApproving(true);

    try {
      const parsedAmount =
        approvedAmount.trim().length > 0 ? Number(approvedAmount) : null;

      if (
        parsedAmount !== null &&
        (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      ) {
        throw new Error("Approved amount must be greater than zero.");
      }

      const response = await fetch(`/api/claim/${selectedClaim.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          approvedAmount: parsedAmount,
        }),
      });

      const json = (await response.json()) as {
        error?: string;
        claim?: {
          status: ClaimStatusType;
          approvedAmount: number;
        };
      };

      if (!response.ok || !json.claim) {
        throw new Error(json.error ?? "Unable to approve claim.");
      }

      setClaims((current) =>
        current.map((claim) =>
          claim.id === selectedClaim.id
            ? {
                ...claim,
                status: json.claim!.status,
                approvedAmount: json.claim!.approvedAmount,
              }
            : claim,
        ),
      );

      setApprovedAmount("");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to approve claim.",
      );
    } finally {
      setIsApproving(false);
    }
  };

  const rejectClaim = async () => {
    if (!selectedClaim) {
      return;
    }

    if (selectedClaim.isDemo) {
      setActionError(
        "Demo claims are read-only. Create or submit a real claim to reject it.",
      );
      return;
    }

    const reason = rejectionReason.trim();

    if (!reason) {
      setActionError("Rejection reason is required.");
      return;
    }

    setActionError(null);
    setIsRejecting(true);

    try {
      const response = await fetch(`/api/claim/${selectedClaim.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });

      const json = (await response.json()) as {
        error?: string;
        claim?: {
          status: ClaimStatusType;
          rejectionReason: string;
        };
      };

      if (!response.ok || !json.claim) {
        throw new Error(json.error ?? "Unable to reject claim.");
      }

      setClaims((current) =>
        current.map((claim) =>
          claim.id === selectedClaim.id
            ? {
                ...claim,
                status: json.claim!.status,
                rejectionReason: json.claim!.rejectionReason,
              }
            : claim,
        ),
      );

      setRejectionReason("");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to reject claim.",
      );
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Warranty Claims"
        description="Review submitted claim documentation and approve or reject payouts."
      />

      <Card>
        <CardHeader>
          <CardTitle>Claims Queue</CardTitle>
          <CardDescription>
            Click any claim row to open the full documentation packet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {claims.some((claim) => claim.isDemo) ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Showing demo claims because no real manufacturer claims were found.
              Demo claims can be viewed but cannot be approved or rejected.
            </p>
          ) : null}

          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as ClaimFilter)}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending Review</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim Number</TableHead>
                <TableHead>Ticket Reference</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Service Center</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClaims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No claims found for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredClaims.map((claim) => (
                  <TableRow
                    key={claim.id}
                    className="cursor-pointer"
                    onClick={() => openClaimDetail(claim.id)}
                  >
                    <TableCell className="font-medium">
                      {claim.claimNumber}
                    </TableCell>
                    <TableCell>{claim.ticketReference}</TableCell>
                    <TableCell className="max-w-72 truncate">
                      {claim.product}
                    </TableCell>
                    <TableCell>{claim.serviceCenter}</TableCell>
                    <TableCell className="text-right">
                      {money.format(claim.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(claim.status)}>
                        {statusLabel(claim.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {new Date(claim.submittedDate).toLocaleDateString(
                        "en-US",
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          {selectedClaim ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Claim Detail: {selectedClaim.claimNumber} (
                  {selectedClaim.ticketReference})
                </DialogTitle>
                <DialogDescription>
                  Full auto-generated documentation from service execution.
                </DialogDescription>
              </DialogHeader>

              {selectedClaimIsDemo ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  This is demo claim data for dashboard preview only. Approval and
                  rejection are disabled because this claim does not exist in the
                  live database.
                </p>
              ) : null}

              <div className="grid gap-4 py-2 xl:grid-cols-3">
                <div className="space-y-4 xl:col-span-2">
                  <Card className="bg-muted/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Documentation Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      {isLoadingClaimDetail && !selectedDocumentation ? (
                        <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                          Loading claim documentation...
                        </p>
                      ) : claimDetailError && !selectedDocumentation ? (
                        <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
                          {claimDetailError}
                        </p>
                      ) : selectedDocumentation ? (
                        <>
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Photos
                            </p>
                            <div className="grid gap-2 sm:grid-cols-3">
                              {selectedDocumentation.photos.length > 0 ? (
                                selectedDocumentation.photos.map((photo) => (
                                  <div
                                    key={photo}
                                    className="flex min-h-24 items-center justify-center rounded-md border bg-background px-2 text-center text-xs"
                                  >
                                    {photo}
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No photos available.
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Timestamps
                            </p>
                            <ul className="space-y-1">
                              {selectedDocumentation.timeline.length > 0 ? (
                                selectedDocumentation.timeline.map(
                                  (timeline) => (
                                    <li
                                      key={`${timeline.label}-${timeline.at}`}
                                      className="rounded-md border bg-background p-2"
                                    >
                                      <p className="font-medium">
                                        {timeline.label}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {new Date(timeline.at).toLocaleString(
                                          "en-IN",
                                        )}
                                      </p>
                                    </li>
                                  ),
                                )
                              ) : selectedDocumentation.timestamps.length >
                                0 ? (
                                selectedDocumentation.timestamps.map(
                                  (timestamp) => (
                                    <li
                                      key={timestamp}
                                      className="rounded-md border bg-background p-2"
                                    >
                                      {new Date(timestamp).toLocaleString(
                                        "en-IN",
                                      )}
                                    </li>
                                  ),
                                )
                              ) : (
                                <li className="rounded-md border bg-background p-2 text-muted-foreground">
                                  No timestamps provided.
                                </li>
                              )}
                            </ul>
                          </div>

                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Parts Used
                            </p>
                            {selectedDocumentation.partsDetailed.length > 0 ? (
                              <div className="space-y-2">
                                {selectedDocumentation.partsDetailed.map(
                                  (part) => (
                                    <div
                                      key={`${part.partName}-${part.partNumber}-${part.quantity}`}
                                      className="rounded-md border bg-background p-2 text-xs"
                                    >
                                      <p className="font-medium">
                                        {part.partName}
                                      </p>
                                      <p className="text-muted-foreground">
                                        {part.partNumber || "No part number"} •
                                        Qty {part.quantity}
                                      </p>
                                      <p>{money.format(part.cost)} each</p>
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {selectedDocumentation.partsUsed.length > 0 ? (
                                  selectedDocumentation.partsUsed.map(
                                    (part) => (
                                      <span
                                        key={part}
                                        className="rounded-full border bg-background px-2 py-1 text-xs"
                                      >
                                        {part}
                                      </span>
                                    ),
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    No parts listed.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Technician Notes
                            </p>
                            <p className="rounded-md border bg-background p-3 leading-relaxed">
                              {selectedDocumentation.technicianNotes}
                            </p>
                          </div>

                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Issue Details
                            </p>
                            <div className="space-y-1 rounded-md border bg-background p-3 text-xs">
                              <p>
                                Category: {selectedDocumentation.issueCategory}
                              </p>
                              <p>
                                Severity: {selectedDocumentation.issueSeverity}
                              </p>
                              <p>{selectedDocumentation.issueDescription}</p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-md border bg-background p-3 text-xs">
                              <p className="mb-1 font-medium">Customer</p>
                              <p>{selectedDocumentation.customer.name}</p>
                              <p>{selectedDocumentation.customer.phone}</p>
                              {selectedDocumentation.customer.email ? (
                                <p>{selectedDocumentation.customer.email}</p>
                              ) : null}
                              {selectedDocumentation.customer.address ? (
                                <p>{selectedDocumentation.customer.address}</p>
                              ) : null}
                            </div>
                            <div className="rounded-md border bg-background p-3 text-xs">
                              <p className="mb-1 font-medium">Cost Breakdown</p>
                              <p>
                                Parts:{" "}
                                {money.format(
                                  selectedDocumentation.costBreakdown.partsCost,
                                )}
                              </p>
                              <p>
                                Labor:{" "}
                                {money.format(
                                  selectedDocumentation.costBreakdown.laborCost,
                                )}{" "}
                                (
                                {selectedDocumentation.costBreakdown.laborHours.toFixed(
                                  2,
                                )}
                                h)
                              </p>
                              <p className="font-semibold">
                                Total:{" "}
                                {money.format(
                                  selectedDocumentation.costBreakdown
                                    .totalClaimAmount,
                                )}
                              </p>
                            </div>
                          </div>

                          {selectedDocumentation.gpsLocation ? (
                            <p className="rounded-md border bg-background p-3 text-xs">
                              Location: {selectedDocumentation.gpsLocation}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                          No documentation is available for this claim yet.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  {selectedDocumentation?.claimReportUrl ? (
                    <Card className="bg-muted/20">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          Claim Report
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Button className="w-full" variant="outline" asChild>
                          <a
                            href={selectedDocumentation.claimReportUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download Claim PDF
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card className="bg-muted/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Approve Claim</CardTitle>
                      <CardDescription>
                        Enter approved payout amount and confirm.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Approved amount"
                        value={approvedAmount}
                        onChange={(event) =>
                          setApprovedAmount(event.target.value)
                        }
                      />
                      <Button
                        type="button"
                        onClick={() => void approveClaim()}
                        className="w-full"
                        disabled={isApproving || selectedClaimIsDemo}
                      >
                        {selectedClaimIsDemo
                          ? "Approve unavailable for demo claim"
                          : isApproving
                            ? "Approving..."
                            : "Approve"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Reject Claim</CardTitle>
                      <CardDescription>
                        Provide reason for audit trail and service center
                        feedback.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        value={rejectionReason}
                        onChange={(event) =>
                          setRejectionReason(event.target.value)
                        }
                        placeholder="Reason for rejection"
                        className="min-h-24"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void rejectClaim()}
                        className="w-full"
                        disabled={isRejecting || selectedClaimIsDemo}
                      >
                        {selectedClaimIsDemo
                          ? "Reject unavailable for demo claim"
                          : isRejecting
                            ? "Rejecting..."
                            : "Reject"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {claimDetailError && selectedDocumentation ? (
                <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {claimDetailError}
                </p>
              ) : null}

              {actionError ? (
                <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {actionError}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

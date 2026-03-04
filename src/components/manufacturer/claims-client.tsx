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
  currency: "USD",
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
    return (
      claim.status === "auto_generated" ||
      claim.status === "submitted" ||
      claim.status === "under_review"
    );
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
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const filteredClaims = useMemo(
    () => claims.filter((claim) => isClaimVisible(claim, filter)),
    [claims, filter],
  );

  const selectedClaim =
    claims.find((claim) => claim.id === selectedClaimId) ?? null;

  const openClaimDetail = (claimId: string) => {
    setSelectedClaimId(claimId);
    setApprovedAmount("");
    setRejectionReason("");
    setActionError(null);
    setIsDialogOpen(true);
  };

  const approveClaim = async () => {
    if (!selectedClaim) {
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

              <div className="grid gap-4 py-2 xl:grid-cols-3">
                <div className="space-y-4 xl:col-span-2">
                  <Card className="bg-muted/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Documentation Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Photos
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {selectedClaim.documentation.photos.length > 0 ? (
                            selectedClaim.documentation.photos.map((photo) => (
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
                          {selectedClaim.documentation.timestamps.length > 0 ? (
                            selectedClaim.documentation.timestamps.map(
                              (timestamp) => (
                                <li
                                  key={timestamp}
                                  className="rounded-md border bg-background p-2"
                                >
                                  {new Date(timestamp).toLocaleString("en-US")}
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
                        <div className="flex flex-wrap gap-2">
                          {selectedClaim.documentation.partsUsed.length > 0 ? (
                            selectedClaim.documentation.partsUsed.map(
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
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Technician Notes
                        </p>
                        <p className="rounded-md border bg-background p-3 leading-relaxed">
                          {selectedClaim.documentation.technicianNotes}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
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
                        onClick={() => void approveClaim()}
                        className="w-full"
                        disabled={isApproving}
                      >
                        {isApproving ? "Approving..." : "Approve"}
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
                        variant="destructive"
                        onClick={() => void rejectClaim()}
                        className="w-full"
                        disabled={isRejecting}
                      >
                        {isRejecting ? "Rejecting..." : "Reject"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

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

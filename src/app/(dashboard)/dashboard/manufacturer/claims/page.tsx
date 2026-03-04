"use client"

import { useMemo, useState } from "react"

import { PageHeader } from "@/components/dashboard/page-header"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Claim, claimsSeed } from "@/lib/mock/manufacturer-dashboard"

type ClaimFilter = "all" | "pending" | "approved" | "rejected" | "paid"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function statusLabel(status: Claim["status"]) {
  switch (status) {
    case "submitted":
      return "Submitted"
    case "under_review":
      return "Under Review"
    case "approved":
      return "Approved"
    case "rejected":
      return "Rejected"
    case "paid":
      return "Paid"
    default:
      return status
  }
}

function isClaimVisible(claim: Claim, filter: ClaimFilter) {
  if (filter === "all") {
    return true
  }

  if (filter === "pending") {
    return claim.status === "submitted" || claim.status === "under_review"
  }

  return claim.status === filter
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState(claimsSeed)
  const [filter, setFilter] = useState<ClaimFilter>("all")
  const [selectedClaimId, setSelectedClaimId] = useState(claimsSeed[0]?.id ?? null)
  const [approvedAmount, setApprovedAmount] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")

  const filteredClaims = useMemo(
    () => claims.filter((claim) => isClaimVisible(claim, filter)),
    [claims, filter]
  )

  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId)

  const updateClaim = (
    claimId: string,
    update: Partial<Pick<Claim, "status" | "amount">>
  ) => {
    setClaims((current) =>
      current.map((claim) =>
        claim.id === claimId
          ? {
              ...claim,
              ...update,
            }
          : claim
      )
    )
  }

  const approveClaim = () => {
    if (!selectedClaim) {
      return
    }

    const parsedAmount = Number(approvedAmount)

    updateClaim(selectedClaim.id, {
      status: "approved",
      amount: Number.isFinite(parsedAmount) && parsedAmount > 0
        ? parsedAmount
        : selectedClaim.amount,
    })

    setApprovedAmount("")
  }

  const rejectClaim = () => {
    if (!selectedClaim || !rejectionReason.trim()) {
      return
    }

    updateClaim(selectedClaim.id, { status: "rejected" })
    setRejectionReason("")
  }

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
            Select any claim row to inspect complete documentation.
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
                    data-state={selectedClaimId === claim.id ? "selected" : undefined}
                    onClick={() => setSelectedClaimId(claim.id)}
                  >
                    <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                    <TableCell>{claim.ticketReference}</TableCell>
                    <TableCell className="max-w-72 truncate">{claim.product}</TableCell>
                    <TableCell>{claim.serviceCenter}</TableCell>
                    <TableCell className="text-right">
                      {money.format(claim.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={claim.status}>
                        {statusLabel(claim.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {new Date(claim.submittedDate).toLocaleDateString("en-US")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedClaim ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              Claim Detail: {selectedClaim.claimNumber} ({selectedClaim.ticketReference})
            </CardTitle>
            <CardDescription>
              Auto-generated documentation packet from service center.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <Card className="bg-muted/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Documentation Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Photos
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {selectedClaim.documentation.photos.map((photo) => (
                        <div
                          key={photo}
                          className="flex min-h-24 items-center justify-center rounded-md border bg-background px-2 text-center text-xs"
                        >
                          {photo}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Timestamps
                    </p>
                    <ul className="space-y-1">
                      {selectedClaim.documentation.timestamps.map((timestamp) => (
                        <li key={timestamp} className="rounded-md border bg-background p-2">
                          {timestamp}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Parts Used
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedClaim.documentation.partsUsed.map((part) => (
                        <span
                          key={part}
                          className="rounded-full border bg-background px-2 py-1 text-xs"
                        >
                          {part}
                        </span>
                      ))}
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
                    onChange={(event) => setApprovedAmount(event.target.value)}
                  />
                  <Button onClick={approveClaim} className="w-full">
                    Approve
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-muted/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Reject Claim</CardTitle>
                  <CardDescription>
                    Provide reason for audit trail and service center feedback.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Reason for rejection"
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button variant="destructive" onClick={rejectClaim} className="w-full">
                    Reject
                  </Button>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

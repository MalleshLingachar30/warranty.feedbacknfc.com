"use client";

import { useState } from "react";

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

type ManufacturerPartReturnRow = {
  id: string;
  returnNumber: string;
  status: string;
  ticketNumber: string;
  serviceCenterName: string | null;
  technicianName: string | null;
  productModelName: string;
  productModelNumber: string | null;
  serialNumber: string | null;
  partName: string;
  partNumber: string | null;
  quantity: number;
  collectionNotes: string | null;
  collectedAt: string | null;
  receivedAtServiceCenterAt: string | null;
  receivedByManufacturerAt: string | null;
  closedAt: string | null;
};

interface PartReturnsClientProps {
  rows: ManufacturerPartReturnRow[];
}

function statusLabel(status: ManufacturerPartReturnRow["status"]) {
  return status.replace(/_/g, " ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PartReturnsClient({ rows }: PartReturnsClientProps) {
  const [items, setItems] = useState(rows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateStatus = async (
    returnId: string,
    action: "receive_manufacturer" | "close",
  ) => {
    setPendingId(returnId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/manufacturer/part-returns/${returnId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        },
      );

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update removed-part return.");
      }

      const now = new Date().toISOString();

      setItems((current) =>
        current.map((item) =>
          item.id !== returnId
            ? item
            : {
                ...item,
                status:
                  action === "receive_manufacturer"
                    ? "received_by_manufacturer"
                    : "closed",
                receivedByManufacturerAt:
                  action === "receive_manufacturer"
                    ? now
                    : item.receivedByManufacturerAt,
                closedAt: action === "close" ? now : item.closedAt,
              },
        ),
      );

      setSuccess(
        action === "receive_manufacturer"
          ? "Manufacturer receipt recorded."
          : "Removed-part return closed.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update removed-part return.",
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Removed Part Return Queue</CardTitle>
        <CardDescription>
          Receive old replaced parts from service centers and close the reverse-logistics cycle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return</TableHead>
              <TableHead>Ticket / Product</TableHead>
              <TableHead>Part</TableHead>
              <TableHead>Service Center</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trace</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No removed-part returns are waiting in the manufacturer queue.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="space-y-0.5">
                      <p>{item.returnNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        Collected {formatDateTime(item.collectedAt)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p>{item.ticketNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.productModelName}
                        {item.productModelNumber ? ` • ${item.productModelNumber}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.serialNumber ?? "Serial unavailable"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p>{item.partName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.partNumber ?? "No part number"} • Qty {item.quantity}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p>{item.serviceCenterName ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.technicianName ?? "Technician unavailable"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {statusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      <p>
                        SC receipt {formatDateTime(item.receivedAtServiceCenterAt)}
                      </p>
                      <p>
                        MFG receipt {formatDateTime(item.receivedByManufacturerAt)}
                      </p>
                      <p>Closed {formatDateTime(item.closedAt)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      {item.status === "received_at_service_center" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pendingId === item.id}
                          onClick={() =>
                            void updateStatus(item.id, "receive_manufacturer")
                          }
                        >
                          Receive at Depot
                        </Button>
                      ) : null}
                      {item.status === "received_by_manufacturer" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pendingId === item.id}
                          onClick={() => void updateStatus(item.id, "close")}
                        >
                          Close Return
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {items.some((item) => item.collectionNotes) ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Latest collection notes</p>
            <ul className="mt-2 space-y-1">
              {items
                .filter((item) => item.collectionNotes)
                .slice(0, 5)
                .map((item) => (
                  <li key={`${item.id}-note`}>
                    <span className="font-medium">{item.returnNumber}:</span>{" "}
                    {item.collectionNotes}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

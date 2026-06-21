"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import type {
  ServiceCenterOption,
  TechnicianOption,
} from "@/components/manufacturer/types";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TicketQueueRow = {
  id: string;
  ticketNumber: string;
  status: string;
  issueCategory: string | null;
  issueSeverity: string;
  reportedAt: string;
  assignedAt: string | null;
  slaBreached: boolean;
  slaResponseDeadline: string | null;
  slaResolutionDeadline: string | null;
  assignedServiceCenter: {
    id: string;
    name: string;
  } | null;
  assignedTechnician: {
    id: string;
    name: string;
  } | null;
  product: {
    serialNumber: string | null;
    customerCity: string | null;
    productModel: {
      name: string;
      modelNumber: string | null;
    };
  };
  sla: {
    state: "on_track" | "at_risk" | "breached" | "none";
    label: string;
    deadline: string | null;
  };
};

type TicketQueueClientProps = {
  initialTickets: TicketQueueRow[];
  serviceCenters: ServiceCenterOption[];
  technicians: TechnicianOption[];
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function statusClass(status: string) {
  switch (status) {
    case "reported":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "awaiting_technician_acceptance":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "assigned":
    case "technician_enroute":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "work_in_progress":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "pending_confirmation":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "resolved":
    case "closed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "reopened":
    case "escalated":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function slaIndicatorClass(state: TicketQueueRow["sla"]["state"]) {
  switch (state) {
    case "on_track":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "at_risk":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "breached":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function canAssignTicket(ticket: TicketQueueRow) {
  return ticket.status !== "resolved" && ticket.status !== "closed";
}

export function TicketQueueClient({
  initialTickets,
  serviceCenters,
  technicians,
}: TicketQueueClientProps) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [assignedServiceCenterId, setAssignedServiceCenterId] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editingTicket =
    tickets.find((ticket) => ticket.id === editingTicketId) ?? null;

  const availableTechnicians = useMemo(() => {
    if (!assignedServiceCenterId) {
      return technicians;
    }

    return technicians.filter(
      (technician) => technician.serviceCenterId === assignedServiceCenterId,
    );
  }, [assignedServiceCenterId, technicians]);

  const openAssignDialog = (ticket: TicketQueueRow) => {
    setEditingTicketId(ticket.id);
    setAssignedServiceCenterId(ticket.assignedServiceCenter?.id ?? "");
    setAssignedTechnicianId(ticket.assignedTechnician?.id ?? "");
    setError(null);
  };

  const closeAssignDialog = () => {
    setEditingTicketId(null);
    setAssignedServiceCenterId("");
    setAssignedTechnicianId("");
    setError(null);
  };

  const saveAssignment = async () => {
    if (!editingTicket) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/manufacturer/tickets/${editingTicket.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignedServiceCenterId,
            assignedTechnicianId,
          }),
        },
      );

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to assign ticket.");
      }

      const selectedCenter =
        serviceCenters.find((center) => center.id === assignedServiceCenterId) ?? null;
      const selectedTechnician =
        technicians.find((technician) => technician.id === assignedTechnicianId) ?? null;

      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === editingTicket.id
            ? {
                ...ticket,
                status: "awaiting_technician_acceptance",
                assignedAt: new Date().toISOString(),
                assignedServiceCenter: selectedCenter
                  ? {
                      id: selectedCenter.id,
                      name: selectedCenter.name,
                    }
                  : null,
                assignedTechnician: selectedTechnician
                  ? {
                      id: selectedTechnician.id,
                      name: selectedTechnician.name,
                    }
                  : null,
              }
            : ticket,
        ),
      );
      closeAssignDialog();
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to assign ticket.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Ticket Queue</CardTitle>
          <CardDescription>
            Latest ticket activity for products owned by this manufacturer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Service Center</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="text-right">Assign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground">
                    No tickets have been created for this organization yet.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-medium">
                      {ticket.ticketNumber}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{ticket.product.productModel.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.product.productModel.modelNumber
                            ? `${ticket.product.productModel.modelNumber} • `
                            : ""}
                          {ticket.product.serialNumber ?? "Serial unavailable"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p>{ticket.issueCategory ?? "General issue"}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {ticket.issueSeverity}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${statusClass(ticket.status)}`}
                      >
                        {statusLabel(ticket.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ticket.assignedServiceCenter?.name ?? "-"}
                    </TableCell>
                    <TableCell>
                      {ticket.assignedTechnician?.name ?? "-"}
                    </TableCell>
                    <TableCell>{ticket.product.customerCity ?? "-"}</TableCell>
                    <TableCell>{formatDateTime(ticket.reportedAt)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge
                          variant="outline"
                          className={slaIndicatorClass(ticket.sla.state)}
                        >
                          {ticket.sla.label}
                        </Badge>
                        {ticket.sla.deadline ? (
                          <p className="text-xs text-muted-foreground">
                            Due {formatDateTime(ticket.sla.deadline)}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canAssignTicket(ticket) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignDialog(ticket)}
                        >
                          {ticket.assignedTechnician ? "Reassign" : "Assign"}
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingTicket)} onOpenChange={(open) => !open && closeAssignDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Ticket</DialogTitle>
            <DialogDescription>
              Route {editingTicket?.ticketNumber ?? "this ticket"} to an authorized
              service center and technician.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">
                Service Center
              </label>
              <select
                value={assignedServiceCenterId}
                onChange={(event) => {
                  setAssignedServiceCenterId(event.target.value);
                  setAssignedTechnicianId("");
                }}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Select a service center</option>
                {serviceCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                    {center.city ? ` • ${center.city}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">
                Technician
              </label>
              <select
                value={assignedTechnicianId}
                onChange={(event) => setAssignedTechnicianId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                disabled={!assignedServiceCenterId}
              >
                <option value="">Select a technician</option>
                {availableTechnicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAssignDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveAssignment()}
              disabled={isSaving || !assignedServiceCenterId || !assignedTechnicianId}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

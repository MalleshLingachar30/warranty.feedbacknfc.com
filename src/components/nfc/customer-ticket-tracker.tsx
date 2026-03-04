import { Check, Circle, Clock3, PhoneCall, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { TicketView } from "@/components/nfc/types";
import { formatDate } from "@/components/nfc/types";

interface CustomerTicketTrackerProps {
  ticket: TicketView;
}

const TRACKING_STEPS = [
  { status: "reported", label: "Reported" },
  { status: "assigned", label: "Assigned" },
  { status: "technician_enroute", label: "Technician En Route" },
  { status: "work_in_progress", label: "Work In Progress" },
  { status: "pending_confirmation", label: "Pending Confirmation" },
  { status: "resolved", label: "Resolved" },
];

export function CustomerTicketTracker({ ticket }: CustomerTicketTrackerProps) {
  const currentStepIndex = TRACKING_STEPS.findIndex(
    (step) => step.status === ticket.status,
  );

  return (
    <NfcPublicShell
      title="Track Service Request"
      description="Your request is active. Follow each service stage in real time."
      footer="Need urgent support? Use the assigned technician contact below."
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="inline-flex items-center gap-2">
              <Ticket className="h-4 w-4 text-blue-700" />
              {ticket.ticketNumber}
            </span>
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              {ticket.status.replace(/_/g, " ")}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>Issue: {ticket.issueDescription}</p>
          <p>Reported on: {formatDate(ticket.reportedAt)}</p>
        </CardContent>
      </Card>

      {ticket.productSummary ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Product Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-700">
            <p>{ticket.productSummary.modelName ?? "Product"}</p>
            <p>Model: {ticket.productSummary.modelNumber ?? "Not available"}</p>
            <p>Serial: {ticket.productSummary.serialNumber ?? "Not available"}</p>
            <p>
              Manufacturer: {ticket.productSummary.manufacturerName ?? "Not available"}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {TRACKING_STEPS.map((step, index) => {
            const isComplete = currentStepIndex >= index;
            const isCurrent = currentStepIndex === index;

            return (
              <div key={step.status} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                    isComplete
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 text-slate-400"
                  }`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                </span>
                <p className={isCurrent ? "font-semibold text-slate-900" : "text-slate-600"}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Assigned Technician</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>Name: {ticket.assignedTechnicianName ?? "Will be assigned soon"}</p>
          {ticket.assignedTechnicianPhone ? (
            <a
              href={`tel:${ticket.assignedTechnicianPhone}`}
              className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-800"
            >
              <PhoneCall className="h-4 w-4" />
              {ticket.assignedTechnicianPhone}
            </a>
          ) : (
            <p>Phone: Not available</p>
          )}
          {ticket.etaLabel ? (
            <p className="inline-flex items-center gap-2 text-slate-600">
              <Clock3 className="h-4 w-4" />
              ETA: {ticket.etaLabel}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Event Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticket.timeline.length === 0 ? (
            <p className="text-sm text-slate-500">No timeline events yet.</p>
          ) : (
            ticket.timeline.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">
                  {event.eventType.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                {event.eventDescription ? (
                  <p className="mt-1 text-sm text-slate-700">{event.eventDescription}</p>
                ) : null}
                {(event.actorName || event.actorRole) ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {event.actorName ?? "System"}
                    {event.actorRole ? ` (${event.actorRole})` : ""}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </NfcPublicShell>
  );
}

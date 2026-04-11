import type { ReactNode } from "react";
import { Check, Circle, Clock3, PhoneCall, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerLiveStatusCard } from "@/components/nfc/customer-live-status-card";
import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { TicketView } from "@/components/nfc/types";
import type { NfcLanguage } from "@/lib/nfc-i18n";
import { getNfcCopy, translateTicketStatus } from "@/lib/nfc-i18n";

interface CustomerTicketTrackerProps {
  ticket: TicketView;
  language: NfcLanguage;
  languageToggle?: ReactNode;
}

function formatDateByLanguage(
  value: Date | string | null | undefined,
  language: NfcLanguage,
) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function translateTimelineEventType(eventType: string, language: NfcLanguage) {
  if (language !== "hi") {
    return eventType.replace(/_/g, " ");
  }

  const mapped: Record<string, string> = {
    created: "बनाया गया",
    reported: "रिपोर्ट किया गया",
    assigned: "असाइन किया गया",
    technician_enroute: "तकनीशियन रास्ते में",
    technician_started: "तकनीशियन ने काम शुरू किया",
    work_completed: "काम पूरा हुआ",
    pending_confirmation: "पुष्टि लंबित",
    resolved: "समाधान हो गया",
    reopened: "फिर से खोला गया",
    claim_auto_generated: "क्लेम स्वतः बना",
    technician_arrived_live: "तकनीशियन पहुंच गया",
    tracking_paused: "लाइव ट्रैकिंग रुकी",
    tracking_resumed: "लाइव ट्रैकिंग फिर शुरू हुई",
    tracking_stopped: "लाइव ट्रैकिंग बंद हुई",
  };

  return mapped[eventType] ?? eventType.replace(/_/g, " ");
}

export function CustomerTicketTracker({
  ticket,
  language,
  languageToggle,
}: CustomerTicketTrackerProps) {
  const copy = getNfcCopy(language);
  const trackingSteps = [
    { status: "reported", label: copy.customerTicketTracker.trackingSteps.reported },
    { status: "assigned", label: copy.customerTicketTracker.trackingSteps.assigned },
    {
      status: "technician_enroute",
      label: copy.customerTicketTracker.trackingSteps.technician_enroute,
    },
    {
      status: "work_in_progress",
      label: copy.customerTicketTracker.trackingSteps.work_in_progress,
    },
    {
      status: "pending_confirmation",
      label: copy.customerTicketTracker.trackingSteps.pending_confirmation,
    },
    { status: "resolved", label: copy.customerTicketTracker.trackingSteps.resolved },
  ];

  const currentStepIndex = trackingSteps.findIndex(
    (step) => step.status === ticket.status,
  );

  return (
    <NfcPublicShell
      title={copy.customerTicketTracker.title}
      description={copy.customerTicketTracker.description}
      footer={copy.customerTicketTracker.footer}
      subtitle={copy.shellSubtitle}
      headerActions={languageToggle}
    >
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="inline-flex items-center gap-2">
              <Ticket className="h-4 w-4 text-blue-700" />
              {ticket.ticketNumber}
            </span>
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              {translateTicketStatus(ticket.status, language)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>
            {copy.customerTicketTracker.issueLabel}: {ticket.issueDescription}
          </p>
          <p>
            {copy.customerTicketTracker.reportedOnLabel}:{" "}
            {formatDateByLanguage(ticket.reportedAt, language)}
          </p>
        </CardContent>
      </Card>

      {ticket.productSummary ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">
              {copy.customerTicketTracker.productSummary}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-700">
            <p>
              {ticket.productSummary.modelName ??
                copy.customerTicketTracker.productFallback}
            </p>
            <p>
              {copy.customerTicketTracker.modelLabel}:{" "}
              {ticket.productSummary.modelNumber ??
                copy.customerTicketTracker.notAvailable}
            </p>
            <p>
              {copy.customerTicketTracker.serialLabel}:{" "}
              {ticket.productSummary.serialNumber ??
                copy.customerTicketTracker.notAvailable}
            </p>
            <p>
              {copy.customerTicketTracker.manufacturerLabel}:{" "}
              {ticket.productSummary.manufacturerName ??
                copy.customerTicketTracker.notAvailable}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">
            {copy.customerTicketTracker.progress}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {trackingSteps.map((step, index) => {
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

      <CustomerLiveStatusCard
        ticketId={ticket.id}
        ticketStatus={ticket.status}
        initialTracking={ticket.liveTracking}
        language={language}
      />

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">
            {copy.customerTicketTracker.assignedTechnician}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>
            {copy.customerTicketTracker.nameLabel}:{" "}
            {ticket.assignedTechnicianName ??
              copy.customerTicketTracker.assignedSoon}
          </p>
          {ticket.assignedTechnicianPhone ? (
            <a
              href={`tel:${ticket.assignedTechnicianPhone}`}
              className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-800"
            >
              <PhoneCall className="h-4 w-4" />
              {ticket.assignedTechnicianPhone}
            </a>
          ) : (
            <p>
              {copy.customerTicketTracker.phoneLabel}:{" "}
              {copy.customerTicketTracker.notAvailable}
            </p>
          )}
          {ticket.etaLabel ? (
            <p className="inline-flex items-center gap-2 text-slate-600">
              <Clock3 className="h-4 w-4" />
              {copy.customerTicketTracker.etaLabel}: {ticket.etaLabel}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">
            {copy.customerTicketTracker.eventTimeline}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticket.timeline.length === 0 ? (
            <p className="text-sm text-slate-500">
              {copy.customerTicketTracker.noTimelineEvents}
            </p>
          ) : (
            ticket.timeline.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">
                  {translateTimelineEventType(event.eventType, language)}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateByLanguage(event.createdAt, language)}
                </p>
                {event.eventDescription ? (
                  <p className="mt-1 text-sm text-slate-700">{event.eventDescription}</p>
                ) : null}
                {(event.actorName || event.actorRole) ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {event.actorName ?? copy.customerTicketTracker.systemActor}
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

"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

import { MobileCodeScannerDialog } from "@/components/scanning/mobile-code-scanner-dialog";
import type { MobileCodeScannerResult } from "@/lib/mobile-code-scanner";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatInternalServiceDisposition } from "@/lib/internal-services";
import { cn } from "@/lib/utils";

type TechnicianOption = {
  id: string;
  name: string;
};

type InternalServiceOrderActionsClientProps = {
  orderId: string;
  actionPath: string;
  returnToPath: string;
  status: string;
  currentAssignedTechnicianId: string | null;
  currentFinalDisposition: string | null;
  currentReportedFault: string;
  currentDiagnosisNotes: string;
  currentResolutionNotes: string;
  benchScanRequired: boolean;
  benchScanVerified: boolean;
  benchStationLease: string | null;
  benchScanTagCode: string | null;
  benchScanHref: string;
  benchStationLockedReason?: string | null;
  technicians: TechnicianOption[];
  noticeAction?: string | null;
  noticeError?: string | null;
};

type WorkflowButton = {
  action: string;
  label: string;
  variant?: "default" | "outline";
};

const DISPOSITION_OPTIONS = [
  "returned_to_customer",
  "returned_to_distributor",
  "returned_to_service_center",
  "refurbished_saleable",
  "returned_to_stock",
  "scrapped",
  "cannibalized",
  "no_fault_found_return",
] as const;

function nextStepLabel(status: string) {
  switch (status) {
    case "inward_received":
      return "Mark Triaged";
    case "awaiting_triage":
      return "Save engineer, then Start Diagnosis";
    case "under_diagnosis":
      return "Await Parts or Start Repair";
    case "awaiting_parts":
      return "Resume Repair";
    case "repair_in_progress":
      return "Submit To QC";
    case "awaiting_qc":
      return "Record QC Result";
    case "qa_failed":
      return "Restart Diagnosis";
    case "ready_for_disposition":
      return "Select disposition, then Complete Disposition";
    case "completed":
      return "Close Order";
    default:
      return "Execution Complete";
  }
}

function workflowButtonsForStatus(status: string): WorkflowButton[] {
  switch (status) {
    case "inward_received":
      return [{ action: "mark_triaged", label: "Mark Triaged" }];
    case "awaiting_triage":
      return [{ action: "start_diagnosis", label: "Start Diagnosis" }];
    case "under_diagnosis":
      return [
        { action: "await_parts", label: "Await Parts", variant: "outline" },
        { action: "start_repair", label: "Start Repair" },
      ];
    case "awaiting_parts":
      return [{ action: "start_repair", label: "Resume Repair" }];
    case "repair_in_progress":
      return [{ action: "submit_to_qc", label: "Submit To QC" }];
    case "awaiting_qc":
      return [
        { action: "fail_qc", label: "Fail QC", variant: "outline" },
        { action: "pass_qc", label: "Pass QC" },
      ];
    case "qa_failed":
      return [{ action: "start_diagnosis", label: "Restart Diagnosis" }];
    case "ready_for_disposition":
      return [{ action: "complete_disposition", label: "Complete Disposition" }];
    case "completed":
      return [{ action: "close_order", label: "Close Order" }];
    default:
      return [];
  }
}

function formatActionNotice(action: string | null | undefined) {
  switch (action) {
    case "save_notes":
      return "Depot notes saved.";
    case "assign_engineer":
      return "Engineer assignment updated.";
    case "mark_triaged":
      return "Order marked as triaged and ready for diagnosis.";
    case "start_diagnosis":
      return "Diagnosis started.";
    case "await_parts":
      return "Order moved to awaiting parts.";
    case "start_repair":
      return "Repair is now in progress.";
    case "submit_to_qc":
      return "Order submitted to QC.";
    case "fail_qc":
      return "QC failure recorded. The order is back in diagnosis.";
    case "pass_qc":
      return "QC passed. Final disposition is now required.";
    case "complete_disposition":
      return "Final disposition recorded.";
    case "close_order":
      return "Internal-service order closed.";
    case "add_part_usage":
      return "Repair part movement recorded.";
    default:
      return null;
  }
}

function SubmitControl({
  actionPath,
  action,
  label,
  disabled = false,
  variant = "default",
}: {
  actionPath: string;
  action: string;
  label: string;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <>
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className={cn(buttonVariants({ variant }))}
        formAction={actionPath}
        formMethod="post"
        disabled={disabled}
      >
        {label}
      </button>
    </>
  );
}

function HiddenStationContext({
  returnToPath,
  benchScanVerified,
  benchStationLease,
}: {
  returnToPath: string;
  benchScanVerified: boolean;
  benchStationLease: string | null;
}) {
  return (
    <>
      <input type="hidden" name="returnTo" value={returnToPath} />
      {benchScanVerified && benchStationLease ? (
        <>
          <input type="hidden" name="station" value="bench" />
          <input type="hidden" name="stationLease" value={benchStationLease} />
        </>
      ) : null}
    </>
  );
}

export function InternalServiceOrderActionsClient({
  actionPath,
  returnToPath,
  status,
  currentAssignedTechnicianId,
  currentFinalDisposition,
  currentReportedFault,
  currentDiagnosisNotes,
  currentResolutionNotes,
  benchScanRequired,
  benchScanVerified,
  benchStationLease,
  benchScanTagCode,
  benchScanHref,
  benchStationLockedReason,
  technicians,
  noticeAction,
  noticeError,
}: InternalServiceOrderActionsClientProps) {
  const [selectedDisposition, setSelectedDisposition] = useState(
    currentFinalDisposition ?? "returned_to_stock",
  );
  const [tracedPartReference, setTracedPartReference] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const benchExecutionLocked =
    Boolean(benchStationLockedReason) ||
    (benchScanRequired && !benchScanVerified);
  const partUsageLocked =
    status === "completed" || status === "closed" || benchExecutionLocked;
  const workflowButtons = workflowButtonsForStatus(status);
  const successNotice = formatActionNotice(noticeAction);
  const handleTracedPartDetected = (scanResult: MobileCodeScannerResult) => {
    setTracedPartReference(scanResult.value);
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base">Depot execution layer</CardTitle>
        <CardDescription>
          Separate internal bench workflow for assignment, diagnosis, repair, QC,
          and final disposition. Next step: {nextStepLabel(status)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {noticeError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {noticeError}
          </div>
        ) : null}

        {successNotice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {successNotice}
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Assignment, notes, and status transitions are intentionally separated.
          Save the engineer first, then advance the depot workflow. This avoids draft
          form state getting mixed into lifecycle transitions.
        </div>

        {benchStationLockedReason ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {benchStationLockedReason}
          </div>
        ) : null}

        {benchScanRequired ? (
          benchScanVerified ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Bench scan verified for controlling tag {benchScanTagCode ?? "-"}.
              Continue diagnosis, repair, and traced part capture without rescanning on each submit.
            </div>
          ) : (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
              Sticker-led bench execution is locked until this unit is opened from Bench Scan.
              <a
                href={benchScanHref}
                className="ml-2 font-medium underline underline-offset-2"
              >
                Open Bench Scan
              </a>
            </div>
          )
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <form method="post" action={actionPath} className="space-y-3 rounded-lg border border-slate-200 p-4">
            <HiddenStationContext
              returnToPath={returnToPath}
              benchScanVerified={benchScanVerified}
              benchStationLease={benchStationLease}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Assigned engineer
              </label>
              <select
                name="assignedTechnicianId"
                defaultValue={currentAssignedTechnicianId ?? ""}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Unassigned</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Save this first before diagnosis, repair, QC, or disposition actions.
              </p>
            </div>
            <SubmitControl
              actionPath={actionPath}
              action="assign_engineer"
              label="Save Assignment"
              variant="outline"
            />
          </form>

          <form method="post" action={actionPath} className="space-y-4 rounded-lg border border-slate-200 p-4">
            <HiddenStationContext
              returnToPath={returnToPath}
              benchScanVerified={benchScanVerified}
              benchStationLease={benchStationLease}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Reported fault / inward brief
              </label>
              <Textarea
                name="reportedFault"
                defaultValue={currentReportedFault}
                rows={3}
                placeholder="Describe the incoming issue and receiving observations."
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Diagnosis notes
                </label>
                <Textarea
                  name="diagnosisNotes"
                  defaultValue={currentDiagnosisNotes}
                  rows={5}
                  placeholder="Bench diagnosis, suspected fault, parts required, root cause."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Resolution notes
                </label>
                <Textarea
                  name="resolutionNotes"
                  defaultValue={currentResolutionNotes}
                  rows={5}
                  placeholder="Repair actions, calibration outcome, readiness for QC or stock."
                />
              </div>
            </div>

            <SubmitControl
              actionPath={actionPath}
              action="save_notes"
              label="Save Notes"
              variant="outline"
            />
          </form>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <form method="post" action={actionPath} className="space-y-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4">
            <HiddenStationContext
              returnToPath={returnToPath}
              benchScanVerified={benchScanVerified}
              benchStationLease={benchStationLease}
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Traced repair spares and kits</p>
              <p className="text-xs text-slate-500">
                Use traced spare, small-part, kit, or pack references for installed, consumed, and returned-unused internal repair movements.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Usage type</label>
                <select
                  name="partUsageType"
                  disabled={partUsageLocked}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="installed">installed</option>
                  <option value="consumed">consumed</option>
                  <option value="returned_unused">returned unused</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-slate-900">
                    Tracked asset / tag reference
                  </label>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-9 px-3 text-xs",
                    )}
                    disabled={partUsageLocked}
                    onClick={() => setScannerOpen(true)}
                  >
                    <Camera className="mr-1.5 size-3.5" />
                    Scan with camera
                  </button>
                </div>
                <Input
                  name="partReference"
                  value={tracedPartReference}
                  onChange={(event) => setTracedPartReference(event.target.value)}
                  disabled={partUsageLocked}
                  placeholder="Required: asset code, serial, or Data Matrix / tag code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p className="text-xs text-slate-500">
                  Scan the spare&apos;s Data Matrix or QR label with the PWA camera,
                  or type the asset code, serial, or tag manually.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Repair note</label>
              <Textarea
                name="partNote"
                disabled={partUsageLocked}
                rows={3}
                placeholder="Why this traced spare or kit was installed, consumed, or returned unused during repair."
              />
            </div>

            {partUsageLocked ? (
              <p className="text-xs text-slate-500">
                {status === "completed" || status === "closed"
                  ? "Traced spare capture is locked once the order is completed or closed."
                  : "Bench scan verification is required before traced spare capture can continue on sticker-led orders."}
              </p>
            ) : (
              <SubmitControl
                actionPath={actionPath}
                action="add_part_usage"
                label="Record Traced Spare Movement"
                variant="outline"
              />
            )}
          </form>

          <MobileCodeScannerDialog
            open={scannerOpen}
            onOpenChange={setScannerOpen}
            onDetected={handleTracedPartDetected}
            title="Scan traced spare with camera"
            description="Use the phone camera to read the spare's QR or Data Matrix label and attach that traced part to this internal-service order."
            initialManualValue={tracedPartReference}
            manualLabel="If the spare label cannot be decoded from the camera, type or paste the traced spare value and continue with the same internal repair flow."
          />

          <form method="post" action={actionPath} className="space-y-4 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 p-4">
            <HiddenStationContext
              returnToPath={returnToPath}
              benchScanVerified={benchScanVerified}
              benchStationLease={benchStationLease}
            />
            <input type="hidden" name="partUsageType" value="removed" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Removed part capture</p>
              <p className="text-xs text-slate-500">
                Capture the failed component removed during depot repair. Add a traced reference if the removed part already carries its own identity.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Removed part reference</label>
                <Input
                  name="partReference"
                  disabled={partUsageLocked}
                  placeholder="Optional traced tag / asset / serial reference"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Removed part name</label>
                <Input
                  name="partName"
                  disabled={partUsageLocked}
                  placeholder="Cooling fan harness, display board, sensor module"
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Removed part number</label>
                <Input
                  name="partNumber"
                  disabled={partUsageLocked}
                  placeholder="Optional removed-part number"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Removal note</label>
                <Textarea
                  name="partNote"
                  disabled={partUsageLocked}
                  rows={3}
                  placeholder="Why it was removed and whether it should be analysed, scrapped, or held for return."
                />
              </div>
            </div>

            {partUsageLocked ? (
              <p className="text-xs text-slate-500">
                {status === "completed" || status === "closed"
                  ? "Removed-part capture is locked once the order is completed or closed."
                  : "Bench scan verification is required before removed-part capture can continue on sticker-led orders."}
              </p>
            ) : (
              <SubmitControl
                actionPath={actionPath}
                action="add_part_usage"
                label="Capture Removed Part"
                variant="outline"
              />
            )}
          </form>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Final disposition
            </label>
            <form method="post" action={actionPath} className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <HiddenStationContext
                returnToPath={returnToPath}
                benchScanVerified={benchScanVerified}
                benchStationLease={benchStationLease}
              />
              <div className="flex-1 space-y-2">
                <select
                  name="finalDisposition"
                  value={selectedDisposition}
                  onChange={(event) => setSelectedDisposition(event.target.value)}
                  disabled={status !== "ready_for_disposition"}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {DISPOSITION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatInternalServiceDisposition(option)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  Enabled once QC passes and the depot is ready to decide stock / return
                  outcome.
                </p>
              </div>
              {status === "ready_for_disposition" ? (
                <a
                  href={`${actionPath}?action=complete_disposition&finalDisposition=${encodeURIComponent(selectedDisposition)}&returnTo=${encodeURIComponent(returnToPath)}${benchScanVerified && benchStationLease ? `&station=bench&stationLease=${encodeURIComponent(benchStationLease)}` : ""}`}
                  className={cn(buttonVariants({ variant: "default" }))}
                >
                  Complete Disposition
                </a>
              ) : null}
            </form>
          </div>

          <div className="flex flex-wrap gap-3">
            {benchExecutionLocked ? (
              <a
                href={benchScanHref}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
                )}
              >
                Open Bench Scan
              </a>
            ) : (
              workflowButtons
                .filter((button) => button.action !== "complete_disposition")
                .map((button) => (
                  <a
                    key={button.action}
                    href={`${actionPath}?action=${encodeURIComponent(button.action)}&returnTo=${encodeURIComponent(returnToPath)}${benchScanVerified && benchStationLease ? `&station=bench&stationLease=${encodeURIComponent(benchStationLease)}` : ""}`}
                    className={cn(buttonVariants({ variant: button.variant }))}
                  >
                    {button.label}
                  </a>
                ))
            )}
          </div>

          {status === "awaiting_triage" ? (
            <p className="text-xs text-amber-700">
              Save the engineer assignment first, then start diagnosis as a separate
              depot action.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

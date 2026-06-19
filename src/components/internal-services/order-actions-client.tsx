import { formatInternalServiceDisposition } from "@/lib/internal-services";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TechnicianOption = {
  id: string;
  name: string;
};

type InternalServiceOrderActionsClientProps = {
  orderId: string;
  actionPath: string;
  status: string;
  currentAssignedTechnicianId: string | null;
  currentFinalDisposition: string | null;
  currentReportedFault: string;
  currentDiagnosisNotes: string;
  currentResolutionNotes: string;
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
      return "Start Diagnosis";
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
      return "Complete Disposition";
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
    default:
      return null;
  }
}

export function InternalServiceOrderActionsClient({
  orderId,
  actionPath,
  status,
  currentAssignedTechnicianId,
  currentFinalDisposition,
  currentReportedFault,
  currentDiagnosisNotes,
  currentResolutionNotes,
  technicians,
  noticeAction,
  noticeError,
}: InternalServiceOrderActionsClientProps) {
  const workflowButtons = workflowButtonsForStatus(status);
  const successNotice = formatActionNotice(noticeAction);
  const formId = `depot-order-action-form-${orderId}`;

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
          Every action here saves the current engineer and notes together with the
          workflow transition. This is a native submit path, so depot updates do not
          depend on client-side PATCH calls.
        </div>

        <form id={formId} method="post" action={actionPath} className="space-y-5">
          <input type="hidden" name="orderId" value={orderId} />

          <div className="grid gap-4 lg:grid-cols-2">
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
                Diagnosis, repair, QC, and disposition actions require an assigned
                engineer. Selecting one here and using the next action is enough.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Final disposition
              </label>
              <select
                name="finalDisposition"
                defaultValue={currentFinalDisposition ?? "returned_to_stock"}
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
          </div>

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

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="action"
              value="save_notes"
              form={formId}
              formAction={actionPath}
              formMethod="post"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Save Notes
            </button>
            <button
              type="submit"
              name="action"
              value="assign_engineer"
              form={formId}
              formAction={actionPath}
              formMethod="post"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Save Assignment
            </button>
            {workflowButtons.map((button) => (
              <button
                key={button.action}
                type="submit"
                name="action"
                value={button.action}
                form={formId}
                formAction={actionPath}
                formMethod="post"
                className={cn(buttonVariants({ variant: button.variant ?? "default" }))}
              >
                {button.label}
              </button>
            ))}
          </div>

          {status === "awaiting_triage" && !currentAssignedTechnicianId ? (
            <p className="text-xs text-amber-700">
              If you are starting diagnosis on this submit, choose the engineer in the
              same form first.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

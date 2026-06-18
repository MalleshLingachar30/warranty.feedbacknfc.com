"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatInternalServiceDisposition } from "@/lib/internal-services";

type TechnicianOption = {
  id: string;
  name: string;
};

type InternalServiceOrderActionsClientProps = {
  orderId: string;
  status: string;
  currentAssignedTechnicianId: string | null;
  currentReportedFault: string;
  currentDiagnosisNotes: string;
  currentResolutionNotes: string;
  technicians: TechnicianOption[];
};

type WorkflowButton = {
  action: string;
  label: string;
  variant?: "default" | "outline";
  requiresEngineer?: boolean;
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

const ACTIONS_REQUIRING_ENGINEER = new Set([
  "start_diagnosis",
  "await_parts",
  "start_repair",
  "submit_to_qc",
  "fail_qc",
  "pass_qc",
  "complete_disposition",
]);

async function submitDepotAction(
  orderId: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`/api/service-center/internal-services/${orderId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to update internal-service order.");
  }
}

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

export function InternalServiceOrderActionsClient({
  orderId,
  status,
  currentAssignedTechnicianId,
  currentReportedFault,
  currentDiagnosisNotes,
  currentResolutionNotes,
  technicians,
}: InternalServiceOrderActionsClientProps) {
  const router = useRouter();
  const [assignedTechnicianId, setAssignedTechnicianId] = useState(
    currentAssignedTechnicianId ?? "",
  );
  const [reportedFault, setReportedFault] = useState(currentReportedFault);
  const [diagnosisNotes, setDiagnosisNotes] = useState(currentDiagnosisNotes);
  const [resolutionNotes, setResolutionNotes] = useState(currentResolutionNotes);
  const [finalDisposition, setFinalDisposition] = useState(
    "returned_to_stock",
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const assignmentDirty =
    assignedTechnicianId !== (currentAssignedTechnicianId ?? "");
  const notesDirty =
    reportedFault !== currentReportedFault ||
    diagnosisNotes !== currentDiagnosisNotes ||
    resolutionNotes !== currentResolutionNotes;
  const hasDraftChanges = assignmentDirty || notesDirty;
  const isPending = pendingAction !== null;

  const workflowButtons = useMemo<WorkflowButton[]>(() => {
    switch (status) {
      case "inward_received":
        return [{ action: "mark_triaged", label: "Mark Triaged" }];
      case "awaiting_triage":
        return [
          {
            action: "start_diagnosis",
            label: "Start Diagnosis",
            requiresEngineer: true,
          },
        ];
      case "under_diagnosis":
        return [
          { action: "await_parts", label: "Await Parts", variant: "outline" as const },
          { action: "start_repair", label: "Start Repair", requiresEngineer: true },
        ];
      case "awaiting_parts":
        return [{ action: "start_repair", label: "Resume Repair", requiresEngineer: true }];
      case "repair_in_progress":
        return [{ action: "submit_to_qc", label: "Submit To QC", requiresEngineer: true }];
      case "awaiting_qc":
        return [
          {
            action: "fail_qc",
            label: "Fail QC",
            variant: "outline" as const,
            requiresEngineer: true,
          },
          { action: "pass_qc", label: "Pass QC", requiresEngineer: true },
        ];
      case "qa_failed":
        return [
          {
            action: "start_diagnosis",
            label: "Restart Diagnosis",
            requiresEngineer: true,
          },
        ];
      case "ready_for_disposition":
        return [
          {
            action: "complete_disposition",
            label: "Complete Disposition",
            requiresEngineer: true,
          },
        ];
      case "completed":
        return [{ action: "close_order", label: "Close Order" }];
      default:
        return [];
    }
  }, [status]);

  const runAction = async (action: string) => {
    setPendingAction(action);
    const isWorkflowAction =
      action !== "save_notes" && action !== "assign_engineer";
    const toastLabel =
      action === "assign_engineer"
        ? assignedTechnicianId
          ? "Saving engineer assignment…"
          : "Clearing engineer assignment…"
        : action === "save_notes"
          ? "Saving depot notes…"
          : "Saving depot action…";
    const toastId = toast.loading(toastLabel);

    try {
      await submitDepotAction(orderId, {
        action,
        assignedTechnicianId: assignedTechnicianId || undefined,
        reportedFault,
        diagnosisNotes,
        resolutionNotes,
        finalDisposition:
          action === "complete_disposition" ? finalDisposition : undefined,
      });

      toast.success(
        action === "assign_engineer"
          ? assignedTechnicianId
            ? "Engineer assignment saved."
            : "Engineer assignment cleared."
          : isWorkflowAction
            ? "Depot workflow updated."
            : "Depot notes saved.",
        { id: toastId },
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update order.",
        { id: toastId },
      );
    } finally {
      setPendingAction(null);
    }
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
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Notes and engineer selection travel with every depot workflow action. Use
            the save buttons when you want to checkpoint edits without changing status.
          </div>
          {assignmentDirty || notesDirty ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {assignmentDirty
                ? "Engineer assignment has changed and is not saved yet. Save it now, or it will be saved with the next depot action."
                : "You have unsaved depot notes. Save them now, or they will be saved with the next depot action."}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Assigned engineer
            </label>
            <select
              value={assignedTechnicianId}
              onChange={(event) => setAssignedTechnicianId(event.target.value)}
              disabled={isPending}
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
              Diagnosis, repair, QC, and disposition actions require an assigned engineer.
              Choose one here and save it explicitly, or let the next workflow action persist it.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Final disposition
            </label>
            <select
              value={finalDisposition}
              onChange={(event) => setFinalDisposition(event.target.value)}
              disabled={isPending || status !== "ready_for_disposition"}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              {DISPOSITION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatInternalServiceDisposition(option)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Enabled once QC passes and the depot is ready to decide stock / return outcome.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-900">
            Reported fault / inward brief
          </label>
          <Textarea
            value={reportedFault}
            onChange={(event) => setReportedFault(event.target.value)}
            disabled={isPending}
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
              value={diagnosisNotes}
              onChange={(event) => setDiagnosisNotes(event.target.value)}
              disabled={isPending}
              rows={5}
              placeholder="Bench diagnosis, suspected fault, parts required, root cause."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Resolution notes
            </label>
            <Textarea
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              disabled={isPending}
              rows={5}
              placeholder="Repair actions, calibration outcome, readiness for QC or stock."
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !notesDirty}
            onClick={() => void runAction("save_notes")}
          >
            {pendingAction === "save_notes" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving Notes…
              </>
            ) : (
              "Save Notes"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !assignmentDirty}
            onClick={() => void runAction("assign_engineer")}
          >
            {pendingAction === "assign_engineer" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving Assignment…
              </>
            ) : (
              "Save Assignment"
            )}
          </Button>
          {workflowButtons.map((button) => (
            <Button
              key={button.action}
              type="button"
              variant={button.variant ?? "default"}
              disabled={
                isPending ||
                ((button.requiresEngineer ||
                  ACTIONS_REQUIRING_ENGINEER.has(button.action)) &&
                  !assignedTechnicianId)
              }
              onClick={() => void runAction(button.action)}
            >
              {pendingAction === button.action ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                button.label
              )}
            </Button>
          ))}
        </div>

        {!assignedTechnicianId &&
        workflowButtons.some(
          (button) =>
            button.requiresEngineer ||
            ACTIONS_REQUIRING_ENGINEER.has(button.action),
        ) ? (
          <p className="text-xs text-amber-700">
            Select an engineer before running the next depot execution step.
          </p>
        ) : null}

        {hasDraftChanges && !isPending ? (
          <p className="text-xs text-slate-500">
            Current edits are local until you save them or use the next depot workflow
            action.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

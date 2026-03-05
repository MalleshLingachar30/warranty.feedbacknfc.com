"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ClaimReviewPart {
  id: string;
  partName: string;
  partNumber: string;
  cost: string;
  quantity: string;
}

interface ClaimReviewFormProps {
  claimId: string;
  claimNumber: string;
  status: string;
  initialNotes: string;
  initialLaborHours: number;
  initialParts: ClaimReviewPart[];
}

function createBlankPart(): ClaimReviewPart {
  return {
    id: crypto.randomUUID(),
    partName: "",
    partNumber: "",
    cost: "0",
    quantity: "1",
  };
}

export function ClaimReviewForm({
  claimId,
  claimNumber,
  status,
  initialNotes,
  initialLaborHours,
  initialParts,
}: ClaimReviewFormProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [laborHours, setLaborHours] = useState(
    Number.isFinite(initialLaborHours) ? String(initialLaborHours) : "0",
  );
  const [parts, setParts] = useState<ClaimReviewPart[]>(
    initialParts.length > 0 ? initialParts : [createBlankPart()],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = status === "auto_generated";

  const updatePart = (
    partId: string,
    updates: Partial<Omit<ClaimReviewPart, "id">>,
  ) => {
    setParts((previous) =>
      previous.map((part) =>
        part.id === partId ? { ...part, ...updates } : part,
      ),
    );
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSuccess(null);
    setError(null);

    const payload = {
      notes,
      laborHours: Number.parseFloat(laborHours) || 0,
      partsUsed: parts
        .map((part) => ({
          partName: part.partName.trim(),
          partNumber: part.partNumber.trim(),
          cost: Number.parseFloat(part.cost) || 0,
          quantity: Math.max(1, Math.floor(Number.parseFloat(part.quantity) || 1)),
        }))
        .filter((part) => part.partName.length > 0),
    };

    try {
      const response = await fetch(`/api/claim/${claimId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = (await response.json()) as {
        error?: string;
        claim?: {
          claimNumber: string;
        };
      };

      if (!response.ok) {
        throw new Error(json.error ?? "Unable to submit claim.");
      }

      setSuccess(
        `Claim ${json.claim?.claimNumber ?? claimNumber} submitted to manufacturer.`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit claim.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-white p-4">
      {!canSubmit ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          This claim is already {status.replace(/_/g, " ")}. It cannot be
          resubmitted.
        </p>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-800">Review Notes</label>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add service-center review notes for manufacturer."
          className="min-h-24"
          disabled={!canSubmit}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-800">Labor Hours</label>
        <Input
          type="number"
          min="0"
          step="0.25"
          value={laborHours}
          onChange={(event) => setLaborHours(event.target.value)}
          disabled={!canSubmit}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-800">Parts Used</label>
          {canSubmit ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() =>
                setParts((previous) => [...previous, createBlankPart()])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Part
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          {parts.map((part) => (
            <div key={part.id} className="rounded-md border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  value={part.partName}
                  onChange={(event) =>
                    updatePart(part.id, { partName: event.target.value })
                  }
                  placeholder="Part name"
                  disabled={!canSubmit}
                />
                <Input
                  value={part.partNumber}
                  onChange={(event) =>
                    updatePart(part.id, { partNumber: event.target.value })
                  }
                  placeholder="Part number"
                  disabled={!canSubmit}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={part.cost}
                  onChange={(event) =>
                    updatePart(part.id, { cost: event.target.value })
                  }
                  placeholder="Unit cost"
                  disabled={!canSubmit}
                />
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={part.quantity}
                  onChange={(event) =>
                    updatePart(part.id, { quantity: event.target.value })
                  }
                  placeholder="Qty"
                  disabled={!canSubmit}
                />
              </div>
              {canSubmit ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 h-8 gap-1 px-2 text-xs text-rose-600 hover:text-rose-700"
                  onClick={() =>
                    setParts((previous) =>
                      previous.filter((entry) => entry.id !== part.id),
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <Button
        className="h-11 w-full"
        disabled={!canSubmit || isSubmitting}
        onClick={() => void handleSubmit()}
      >
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Review & Submit to Manufacturer
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, Star } from "lucide-react";

import { Button } from "@/components/ui/button";

type TicketResolutionActionsProps = {
  ticketId: string;
  canConfirm: boolean;
  canReopen: boolean;
  size?: "default" | "sm";
};

async function postTicketAction(
  ticketId: string,
  action: "confirm" | "reopen",
  rating?: number,
) {
  const response = await fetch(`/api/ticket/${ticketId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      ...(action === "confirm" && typeof rating === "number" ? { rating } : {}),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to update ticket right now.");
  }

  return body;
}

export function TicketResolutionActions({
  ticketId,
  canConfirm,
  canReopen,
  size = "default",
}: TicketResolutionActionsProps) {
  const router = useRouter();
  const [serviceRating, setServiceRating] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (action: "confirm" | "reopen") => {
    if (action === "confirm" && serviceRating === null) {
      toast.error("Rate technician service from 1 to 5 before confirming.");
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading("Updating ticket…");

      try {
        const body = await postTicketAction(ticketId, action, serviceRating ?? undefined);
        toast.success(body.message ?? "Ticket updated.", { id: toastId });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update ticket.", {
          id: toastId,
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      {canConfirm ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">
            Rate technician service (required)
          </p>
          <div className="grid grid-cols-5 gap-2 sm:max-w-sm">
            {Array.from({ length: 5 }).map((_, index) => {
              const value = index + 1;
              const isSelected = serviceRating === value;

              return (
                <button
                  key={value}
                  type="button"
                  className={`flex h-10 items-center justify-center gap-1 rounded-md border text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                  onClick={() => setServiceRating(value)}
                  disabled={isPending}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                >
                  <Star
                    className={`h-4 w-4 ${
                      isSelected ? "fill-amber-400 text-amber-500" : "text-slate-400"
                    }`}
                  />
                  <span>{value}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {canConfirm ? (
          <Button
            type="button"
            size={size}
            className="gap-2"
            onClick={() => run("confirm")}
            disabled={isPending}
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirm Resolution
          </Button>
        ) : null}
        {canReopen ? (
          <Button
            type="button"
            size={size}
            variant="outline"
            className="gap-2"
            onClick={() => run("reopen")}
            disabled={isPending}
          >
            <RotateCcw className="h-4 w-4" />
            Not Fixed
          </Button>
        ) : null}
      </div>
    </div>
  );
}

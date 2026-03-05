"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type TicketResolutionActionsProps = {
  ticketId: string;
  canConfirm: boolean;
  canReopen: boolean;
  size?: "default" | "sm";
};

async function postTicketAction(ticketId: string, action: "confirm" | "reopen") {
  const response = await fetch(`/api/ticket/${ticketId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
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
  const [isPending, startTransition] = useTransition();

  const run = (action: "confirm" | "reopen") => {
    startTransition(async () => {
      const toastId = toast.loading("Updating ticket…");

      try {
        const body = await postTicketAction(ticketId, action);
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
  );
}


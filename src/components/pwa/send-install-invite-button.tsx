"use client";

import { useState } from "react";
import { Loader2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

type SendInstallInviteButtonProps = {
  target: "technician" | "service_center_admin";
  technicianId?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
};

export function SendInstallInviteButton({
  target,
  technicianId,
  variant = "outline",
  size = "sm",
}: SendInstallInviteButtonProps) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendInvite = async () => {
    setIsSending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/service-center/install-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target,
          technicianId,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Unable to send install invite.");
      }

      setMessage(payload.message ?? "Install invite sent.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to send install invite.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => void sendInvite()}
        disabled={isSending}
        className="gap-2"
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Smartphone className="h-4 w-4" />
        )}
        Send Install Invite
      </Button>
      {message ? (
        <p className="text-xs text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

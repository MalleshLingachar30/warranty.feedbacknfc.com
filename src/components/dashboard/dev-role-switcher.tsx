"use client";

import { useState, useTransition } from "react";

import { APP_ROLES, type AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";

interface DevRoleSwitcherProps {
  currentRole: AppRole;
}

export function DevRoleSwitcher({ currentRole }: DevRoleSwitcherProps) {
  const [selectedRole, setSelectedRole] = useState<AppRole>(currentRole);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onApplyRole = () => {
    setStatusMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/dev/role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: selectedRole }),
      });

      if (!response.ok) {
        setStatusMessage("Unable to update role.");
        return;
      }

      setStatusMessage(
        `Role updated to ${selectedRole}. If navigation does not update immediately, sign out and sign in again.`,
      );
      window.location.href = "/dashboard";
    });
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Development Role Switcher</p>
      <p className="mt-1 text-xs text-amber-800">
        For local testing only. This updates Clerk user metadata role.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={selectedRole}
          onChange={(event) => setSelectedRole(event.target.value as AppRole)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
        >
          {APP_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        <Button onClick={onApplyRole} disabled={isPending}>
          {isPending ? "Applying..." : "Apply Role"}
        </Button>
      </div>

      {statusMessage ? (
        <p className="mt-2 text-xs text-amber-900">{statusMessage}</p>
      ) : null}
    </div>
  );
}

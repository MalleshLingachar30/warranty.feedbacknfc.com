"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Save, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RecipientRole =
  | "manufacturer"
  | "service_center"
  | "technician"
  | "customer";

type PreferenceRule = {
  recipientRole: RecipientRole;
  emailEnabled: boolean;
  smsEnabled: boolean;
  source: "default" | "organization_override";
  updatedAt: string | null;
};

export type PmNotificationPreferencesView = {
  organizationId: string;
  canManage: boolean;
  roles: PreferenceRule[];
  emailEnabledRoleCount: number;
  smsEnabledRoleCount: number;
  smsDeliverySupported: false;
};

const roleCopy: Record<RecipientRole, { label: string; description: string }> =
  {
    manufacturer: {
      label: "Manufacturer",
      description:
        "Manufacturer workspace recipients and organization contact.",
    },
    service_center: {
      label: "Service center",
      description: "Assigned center address, then its organization contact.",
    },
    technician: {
      label: "Technician",
      description: "The assigned technician user contact only.",
    },
    customer: {
      label: "Customer",
      description: "The asset customer user contact only.",
    },
  };

export function PmNotificationPreferencesPanel({
  preferences,
}: {
  preferences: PmNotificationPreferencesView;
}) {
  const [rules, setRules] = useState(() => preferences.roles);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateRule = (
    recipientRole: RecipientRole,
    channel: "emailEnabled" | "smsEnabled",
    enabled: boolean,
  ) => {
    setRules((current) =>
      current.map((rule) =>
        rule.recipientRole === recipientRole
          ? { ...rule, [channel]: enabled }
          : rule,
      ),
    );
    setMessage(null);
    setError(null);
  };

  const savePreferences = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/preventive-maintenance/notifications/preferences",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roles: rules.map((rule) => ({
              recipientRole: rule.recipientRole,
              emailEnabled: rule.emailEnabled,
              smsEnabled: rule.smsEnabled,
            })),
          }),
        },
      );
      const body = (await response.json()) as
        | { preferences: PmNotificationPreferencesView }
        | { error?: string };

      if (!response.ok || !("preferences" in body)) {
        throw new Error(
          "error" in body
            ? (body.error ?? "Unable to save PM notification preferences.")
            : "Unable to save PM notification preferences.",
        );
      }

      setRules(body.preferences.roles);
      setMessage(
        "Preferences saved. New dispatch evaluations will use these rules.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save PM notification preferences.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Settings2 className="h-4 w-4 text-slate-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Organization channel rules
            </p>
            <Badge variant="outline" className="text-[10px] uppercase">
              {preferences.canManage ? "Editable" : "Read only"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Rules are resolved by recipient role before an address becomes a
            live-capable attempt.
          </p>
        </div>
        {preferences.canManage ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void savePreferences()}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save rules
          </Button>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Audience</th>
              <th className="w-28 px-3 py-2 font-semibold">Email</th>
              <th className="w-32 px-3 py-2 font-semibold">SMS desired</th>
              <th className="w-28 px-3 py-2 font-semibold">Rule source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rules.map((rule) => {
              const copy = roleCopy[rule.recipientRole];

              return (
                <tr key={rule.recipientRole} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-900">{copy.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {copy.description}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={rule.emailEnabled}
                        onChange={(event) =>
                          updateRule(
                            rule.recipientRole,
                            "emailEnabled",
                            event.currentTarget.checked,
                          )
                        }
                        disabled={!preferences.canManage || isSaving}
                        className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                        aria-label={`${copy.label} email enabled`}
                      />
                      {rule.emailEnabled ? "Enabled" : "Disabled"}
                    </label>
                  </td>
                  <td className="px-3 py-2.5">
                    <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={rule.smsEnabled}
                        onChange={(event) =>
                          updateRule(
                            rule.recipientRole,
                            "smsEnabled",
                            event.currentTarget.checked,
                          )
                        }
                        disabled={!preferences.canManage || isSaving}
                        className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                        aria-label={`${copy.label} SMS desired`}
                      />
                      {rule.smsEnabled ? "Desired" : "Disabled"}
                    </label>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500">
                    {rule.source === "organization_override"
                      ? "Organization"
                      : "Role default"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          SMS delivery is unsupported. Enabling “SMS desired” records future
          routing intent only; every SMS attempt remains suppressed until an
          approved provider route is implemented.
        </p>
      </div>
      {message ? (
        <p className="mt-2 text-xs text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

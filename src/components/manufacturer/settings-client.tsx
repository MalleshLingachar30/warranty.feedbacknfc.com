"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SeverityHours = {
  low: number;
  medium: number;
  high: number;
  critical: number;
};

type SettingsPayload = {
  sla: {
    responseHoursBySeverity: SeverityHours;
    resolutionHoursBySeverity: SeverityHours;
  };
  notifications: {
    smsEnabled: boolean;
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    notifyOnSlaBreach: boolean;
    weeklyDigest: boolean;
  };
  integrations: {
    erpWebhookUrl: string;
    apiKeyLabel: string;
  };
};

type OrganizationPayload = {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  gstNumber: string;
};

interface ManufacturerSettingsClientProps {
  initialOrganization: OrganizationPayload;
  initialSettings: SettingsPayload;
}

function sanitizeHours(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function SeverityHoursEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: SeverityHours;
  onChange: (next: SeverityHours) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Low</span>
          <Input
            type="number"
            min={0}
            value={value.low}
            onChange={(event) =>
              onChange({ ...value, low: sanitizeHours(event.target.value) })
            }
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Medium</span>
          <Input
            type="number"
            min={0}
            value={value.medium}
            onChange={(event) =>
              onChange({ ...value, medium: sanitizeHours(event.target.value) })
            }
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>High</span>
          <Input
            type="number"
            min={0}
            value={value.high}
            onChange={(event) =>
              onChange({ ...value, high: sanitizeHours(event.target.value) })
            }
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Critical</span>
          <Input
            type="number"
            min={0}
            value={value.critical}
            onChange={(event) =>
              onChange({
                ...value,
                critical: sanitizeHours(event.target.value),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border p-3">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
    </label>
  );
}

export function ManufacturerSettingsClient({
  initialOrganization,
  initialSettings,
}: ManufacturerSettingsClientProps) {
  const [organization, setOrganization] =
    useState<OrganizationPayload>(initialOrganization);
  const [settings, setSettings] = useState<SettingsPayload>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      if (!organization.name.trim()) {
        throw new Error("Organization name is required.");
      }

      const response = await fetch("/api/manufacturer/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization,
          sla: settings.sla,
          notifications: settings.notifications,
          integrations: settings.integrations,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        organization?: OrganizationPayload;
        settings?: SettingsPayload;
      };

      if (!response.ok || !payload.organization || !payload.settings) {
        throw new Error(payload.error ?? "Unable to save settings.");
      }

      setOrganization(payload.organization);
      setSettings(payload.settings);
      setSaveMessage("Settings saved successfully.");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save settings.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage organization profile, SLA thresholds, notifications, and integration metadata."
        actions={
          <Button
            onClick={() => void saveSettings()}
            disabled={isSaving}
            className="min-w-32"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save Changes
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span>Organization Name</span>
              <Input
                value={organization.name}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Contact Email</span>
              <Input
                value={organization.contactEmail}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    contactEmail: event.target.value,
                  }))
                }
                type="email"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Contact Phone</span>
              <Input
                value={organization.contactPhone}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    contactPhone: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span>Address</span>
              <Input
                value={organization.address}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>City</span>
              <Input
                value={organization.city}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>State</span>
              <Input
                value={organization.state}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    state: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Country</span>
              <Input
                value={organization.country}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    country: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Pincode</span>
              <Input
                value={organization.pincode}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    pincode: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span>GST Number</span>
              <Input
                value={organization.gstNumber}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    gstNumber: event.target.value,
                  }))
                }
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SLA Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SeverityHoursEditor
              title="Response Time (hours)"
              value={settings.sla.responseHoursBySeverity}
              onChange={(next) =>
                setSettings((current) => ({
                  ...current,
                  sla: {
                    ...current.sla,
                    responseHoursBySeverity: next,
                  },
                }))
              }
            />
            <SeverityHoursEditor
              title="Resolution Time (hours)"
              value={settings.sla.resolutionHoursBySeverity}
              onChange={(next) =>
                setSettings((current) => ({
                  ...current,
                  sla: {
                    ...current.sla,
                    resolutionHoursBySeverity: next,
                  },
                }))
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow
              label="SMS Notifications"
              checked={settings.notifications.smsEnabled}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    smsEnabled: checked,
                  },
                }))
              }
            />
            <ToggleRow
              label="Email Notifications"
              checked={settings.notifications.emailEnabled}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    emailEnabled: checked,
                  },
                }))
              }
            />
            <ToggleRow
              label="WhatsApp Notifications"
              checked={settings.notifications.whatsappEnabled}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    whatsappEnabled: checked,
                  },
                }))
              }
            />
            <ToggleRow
              label="Notify On SLA Breach"
              checked={settings.notifications.notifyOnSlaBreach}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    notifyOnSlaBreach: checked,
                  },
                }))
              }
            />
            <ToggleRow
              label="Weekly Digest"
              checked={settings.notifications.weeklyDigest}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    weeklyDigest: checked,
                  },
                }))
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="space-y-1 text-sm">
              <span>ERP Webhook URL</span>
              <Input
                value={settings.integrations.erpWebhookUrl}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    integrations: {
                      ...current.integrations,
                      erpWebhookUrl: event.target.value,
                    },
                  }))
                }
                placeholder="https://erp.example.com/webhooks/warranty"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Integration Label</span>
              <Input
                value={settings.integrations.apiKeyLabel}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    integrations: {
                      ...current.integrations,
                      apiKeyLabel: event.target.value,
                    },
                  }))
                }
                placeholder="Primary ERP Key"
              />
            </label>
          </CardContent>
        </Card>
      </div>

      {saveError ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {saveError}
        </p>
      ) : null}

      {saveMessage ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saveMessage}
        </p>
      ) : null}
    </div>
  );
}

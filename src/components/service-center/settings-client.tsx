"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
};

type ServiceCenterSettingsPayload = {
  notifications: {
    smsEnabled: boolean;
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    notifyOnSlaBreach: boolean;
    dailyDigest: boolean;
  };
};

type CenterPayload = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  serviceRadiusKm: number;
  supportedCategories: string[];
  isActive: boolean;
};

type CenterDraft = CenterPayload & {
  supportedCategoriesText: string;
};

interface ServiceCenterSettingsClientProps {
  initialOrganization: OrganizationPayload;
  initialSettings: ServiceCenterSettingsPayload;
  initialCenters: CenterPayload[];
}

function parseRadius(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
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

export function ServiceCenterSettingsClient({
  initialOrganization,
  initialSettings,
  initialCenters,
}: ServiceCenterSettingsClientProps) {
  const [organization, setOrganization] =
    useState<OrganizationPayload>(initialOrganization);
  const [settings, setSettings] =
    useState<ServiceCenterSettingsPayload>(initialSettings);
  const [centers, setCenters] = useState<CenterDraft[]>(
    initialCenters.map((center) => ({
      ...center,
      supportedCategoriesText: center.supportedCategories.join(", "),
    })),
  );
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

      const response = await fetch("/api/service-center/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization,
          settings,
          centers: centers.map((center) => ({
            id: center.id,
            name: center.name,
            address: center.address,
            city: center.city,
            state: center.state,
            pincode: center.pincode,
            phone: center.phone,
            email: center.email,
            serviceRadiusKm: center.serviceRadiusKm,
            supportedCategories: center.supportedCategoriesText
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0),
            isActive: center.isActive,
          })),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        organization?: OrganizationPayload;
        settings?: ServiceCenterSettingsPayload;
        centers?: CenterPayload[];
      };

      if (
        !response.ok ||
        !payload.organization ||
        !payload.settings ||
        !payload.centers
      ) {
        throw new Error(payload.error ?? "Unable to save settings.");
      }

      setOrganization(payload.organization);
      setSettings(payload.settings);
      setCenters(
        payload.centers.map((center) => ({
          ...center,
          supportedCategoriesText: center.supportedCategories.join(", "),
        })),
      );
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
        description="Manage organization profile, notification preferences, and service-center operational settings."
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
                type="email"
                value={organization.contactEmail}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    contactEmail: event.target.value,
                  }))
                }
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
              label="Daily Digest"
              checked={settings.notifications.dailyDigest}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    dailyDigest: checked,
                  },
                }))
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Service Centers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {centers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No service-center records are available for this organization.
            </p>
          ) : (
            centers.map((center) => (
              <div
                key={center.id}
                className="rounded-lg border p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-1">
                    <span>Center Name</span>
                    <Input
                      value={center.name}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Phone</span>
                    <Input
                      value={center.phone}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, phone: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Email</span>
                    <Input
                      type="email"
                      value={center.email}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, email: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-2">
                    <span>Address</span>
                    <Input
                      value={center.address}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, address: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>City</span>
                    <Input
                      value={center.city}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, city: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>State</span>
                    <Input
                      value={center.state}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, state: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Pincode</span>
                    <Input
                      value={center.pincode}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, pincode: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Service Radius (km)</span>
                    <Input
                      type="number"
                      min={0}
                      value={center.serviceRadiusKm}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? {
                                  ...item,
                                  serviceRadiusKm: parseRadius(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-2">
                    <span>Supported Categories (comma-separated)</span>
                    <Input
                      value={center.supportedCategoriesText}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? {
                                  ...item,
                                  supportedCategoriesText: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="ac, refrigerator, water_purifier"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={center.isActive}
                      onChange={(event) =>
                        setCenters((current) =>
                          current.map((item) =>
                            item.id === center.id
                              ? { ...item, isActive: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    Active center
                  </label>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

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

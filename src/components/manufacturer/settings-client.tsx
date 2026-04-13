"use client";

import { useState } from "react";
import { Loader2, Save, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { TagInput } from "@/components/dashboard/tag-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ACTIVATION_MODES,
  ACTIVATION_TRIGGERS,
  CUSTOMER_CREATION_MODES,
  INSTALLATION_OWNERSHIP_MODES,
  PART_TRACEABILITY_MODES,
  SMALL_PART_TRACKING_MODES,
  type ManufacturerPolicyDefaults,
} from "@/lib/manufacturer-policy";
import { type ManufacturerStickerConfig } from "@/lib/sticker-config";

type SeverityHours = {
  low: number;
  medium: number;
  high: number;
  critical: number;
};

type NotificationEvents = {
  warrantyActivated: boolean;
  ticketCreated: boolean;
  technicianUpdates: boolean;
  claimSubmitted: boolean;
  claimDecision: boolean;
  warrantyExpiring: boolean;
  slaBreached: boolean;
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
    events: NotificationEvents;
  };
  integrations: {
    erpWebhookUrl: string;
    apiKeyLabel: string;
    erpApiKeyMasked: string;
  };
  stickers: ManufacturerStickerConfig;
  policyDefaults: ManufacturerPolicyDefaults;
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
  logoUrl: string;
};

type TeamMemberPayload = {
  id: string;
  name: string;
  email: string;
  clerkId: string;
  isActive: boolean;
  createdAt: string;
};

interface ManufacturerSettingsClientProps {
  initialOrganization: OrganizationPayload;
  initialSettings: SettingsPayload;
  initialTeamMembers: TeamMemberPayload[];
}

function sanitizeHours(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function sanitizePercent(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(30, Math.max(10, parsed));
}

function formatPolicyOption(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function ManufacturerSettingsClient({
  initialOrganization,
  initialSettings,
  initialTeamMembers,
}: ManufacturerSettingsClientProps) {
  const [organization, setOrganization] =
    useState<OrganizationPayload>(initialOrganization);
  const [settings, setSettings] = useState<SettingsPayload>(initialSettings);
  const [teamMembers, setTeamMembers] =
    useState<TeamMemberPayload[]>(initialTeamMembers);
  const [inviteDraft, setInviteDraft] = useState({
    clerkId: "",
    name: "",
    email: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [togglingMemberId, setTogglingMemberId] = useState<string | null>(null);
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
          stickers: settings.stickers,
          policyDefaults: settings.policyDefaults,
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

  const inviteTeamMember = async () => {
    setIsInviting(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      if (!inviteDraft.clerkId.trim()) {
        throw new Error("Clerk user ID is required.");
      }

      const response = await fetch("/api/manufacturer/team-members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clerkId: inviteDraft.clerkId,
          name: inviteDraft.name,
          email: inviteDraft.email,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        member?: TeamMemberPayload;
      };

      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "Unable to add team member.");
      }

      setTeamMembers((current) => {
        const existingIndex = current.findIndex(
          (entry) => entry.id === payload.member!.id,
        );

        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = payload.member!;
          return next;
        }

        return [...current, payload.member!];
      });
      setInviteDraft({ clerkId: "", name: "", email: "" });
      setSaveMessage("Team member linked successfully.");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to add team member.",
      );
    } finally {
      setIsInviting(false);
    }
  };

  const toggleTeamMemberStatus = async (
    memberId: string,
    isActive: boolean,
  ) => {
    setTogglingMemberId(memberId);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await fetch(
        `/api/manufacturer/team-members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isActive }),
        },
      );

      const payload = (await response.json()) as {
        error?: string;
        member?: TeamMemberPayload;
      };

      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "Unable to update team member.");
      }

      setTeamMembers((current) =>
        current.map((entry) =>
          entry.id === payload.member!.id ? payload.member! : entry,
        ),
      );
      setSaveMessage("Team member status updated.");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to update team member.",
      );
    } finally {
      setTogglingMemberId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage organization profile, sticker configuration, SLA configuration, notifications, API integrations, and team members."
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
            <label className="space-y-1 text-sm sm:col-span-2">
              <span>Logo URL</span>
              <Input
                value={organization.logoUrl}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    logoUrl: event.target.value,
                  }))
                }
                placeholder="https://cdn.example.com/logo.png"
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
            <CardTitle>Sticker Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium">Sticker Technology Mode</p>
              <div className="space-y-3 rounded-md border p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="stickerMode"
                    value="qr_only"
                    checked={settings.stickers.mode === "qr_only"}
                    onChange={() =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          mode: "qr_only",
                        },
                      }))
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">QR Code Only</p>
                    <p className="text-xs text-muted-foreground">
                      Best for: India mass market, cost-sensitive. Sticker cost:
                      ₹2-10 per unit. Customer scans QR code with phone camera.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="stickerMode"
                    value="nfc_qr"
                    checked={settings.stickers.mode === "nfc_qr"}
                    onChange={() =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          mode: "nfc_qr",
                        },
                      }))
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      NFC + QR Code{" "}
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Recommended
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Best for: Premium appliances, medical equipment. Sticker
                      cost: ₹15-30 per unit. Customer can tap OR scan — both
                      work.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="stickerMode"
                    value="nfc_only"
                    checked={settings.stickers.mode === "nfc_only"}
                    onChange={() =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          mode: "nfc_only",
                        },
                      }))
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">NFC Only</p>
                    <p className="text-xs text-muted-foreground">
                      Best for: Markets with high NFC awareness. Sticker cost:
                      ₹15-25 per unit. Customer must tap — no QR fallback.
                    </p>
                  </div>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Changing sticker mode affects future allocations only. Existing
                allocated/bound stickers keep their original type.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Sticker Branding</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>Brand Color</span>
                  <Input
                    type="color"
                    value={settings.stickers.branding.primaryColor}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            primaryColor: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span>Logo URL</span>
                  <Input
                    value={settings.stickers.branding.logoUrl}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            logoUrl: event.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="https://cdn.example.com/logo.png"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm sm:col-span-2">
                  <div className="space-y-1">
                    <span className="block">Place Logo in Center of QR</span>
                    <p className="text-xs text-muted-foreground">
                      Applies to print-ready QR sheet exports. Best with a
                      simple square logo and strong QR error correction.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.stickers.branding.showLogoInQrCenter}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            showLogoInQrCenter: event.target.checked,
                          },
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                </label>

                <label className="space-y-1 text-sm sm:col-span-2">
                  <span>QR Center Logo Size (%)</span>
                  <Input
                    type="number"
                    min={10}
                    max={30}
                    step={1}
                    value={settings.stickers.branding.qrLogoScalePercent}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            qrLogoScalePercent: sanitizePercent(
                              event.target.value,
                              current.stickers.branding.qrLogoScalePercent,
                            ),
                          },
                        },
                      }))
                    }
                    disabled={!settings.stickers.branding.showLogoInQrCenter}
                  />
                </label>

                <label className="space-y-1 text-sm sm:col-span-2">
                  <span>Instruction Text (English)</span>
                  <Input
                    value={settings.stickers.branding.instructionTextEn}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            instructionTextEn: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span>Regional Language</span>
                  <select
                    value={settings.stickers.branding.regionalLanguage}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            regionalLanguage: event.target
                              .value as ManufacturerStickerConfig["branding"]["regionalLanguage"],
                          },
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="hi">Hindi</option>
                    <option value="ar">Arabic</option>
                  </select>
                </label>

                <label className="space-y-1 text-sm">
                  <span>
                    Instruction Text (
                    {settings.stickers.branding.regionalLanguage === "ar"
                      ? "Arabic"
                      : "Hindi"}
                    )
                  </span>
                  <Input
                    value={
                      settings.stickers.branding.regionalLanguage === "ar"
                        ? settings.stickers.branding.instructionTextAr
                        : settings.stickers.branding.instructionTextHi
                    }
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            ...(current.stickers.branding.regionalLanguage ===
                            "ar"
                              ? { instructionTextAr: event.target.value }
                              : { instructionTextHi: event.target.value }),
                          },
                        },
                      }))
                    }
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm sm:col-span-2">
                  <span>Show Support Phone</span>
                  <input
                    type="checkbox"
                    checked={settings.stickers.branding.showSupportPhone}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            showSupportPhone: event.target.checked,
                          },
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                </label>

                <label className="space-y-1 text-sm sm:col-span-2">
                  <span>Support Phone</span>
                  <Input
                    value={settings.stickers.branding.supportPhone}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          branding: {
                            ...current.stickers.branding,
                            supportPhone: event.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="+91 7899910288"
                    disabled={!settings.stickers.branding.showSupportPhone}
                  />
                </label>

                <label className="space-y-1 text-sm sm:col-span-2">
                  <span>Sticker URL Base</span>
                  <Input
                    value={settings.stickers.urlBase}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        stickers: {
                          ...current.stickers,
                          urlBase: event.target.value,
                        },
                      }))
                    }
                    placeholder="warranty.feedbacknfc.com"
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activation Policy Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Default Activation Mode</span>
                <select
                  value={settings.policyDefaults.defaultActivationMode}
                  onChange={(event) =>
                    setSettings((current) => {
                      const nextMode = event.target
                        .value as ManufacturerPolicyDefaults["defaultActivationMode"];

                      if (nextMode !== "installation_driven") {
                        return {
                          ...current,
                          policyDefaults: {
                            ...current.policyDefaults,
                            defaultActivationMode: nextMode,
                          },
                        };
                      }

                      return {
                        ...current,
                        policyDefaults: {
                          ...current.policyDefaults,
                          defaultActivationMode: "installation_driven",
                          defaultActivationTrigger:
                            "installation_report_submission",
                          defaultCustomerCreationMode: "on_installation",
                          defaultAllowUnitSelfActivation: false,
                          defaultAcknowledgementRequired: true,
                          defaultPartTraceabilityMode:
                            current.policyDefaults.defaultPartTraceabilityMode ===
                            "none"
                              ? "pack_or_kit"
                              : current.policyDefaults.defaultPartTraceabilityMode,
                          defaultRequiredPhotoPolicy: {
                            ...current.policyDefaults.defaultRequiredPhotoPolicy,
                            requireBeforePhoto: true,
                            requireAfterPhoto: true,
                            minimumPhotoCount: Math.max(
                              2,
                              current.policyDefaults.defaultRequiredPhotoPolicy
                                .minimumPhotoCount,
                            ),
                          },
                        },
                      };
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ACTIVATION_MODES.map((option) => (
                    <option key={option} value={option}>
                      {formatPolicyOption(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span>Default Installer Authority</span>
                <select
                  value={settings.policyDefaults.defaultInstallationOwnershipMode}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultInstallationOwnershipMode: event.target
                          .value as ManufacturerPolicyDefaults["defaultInstallationOwnershipMode"],
                      },
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {INSTALLATION_OWNERSHIP_MODES.map((option) => (
                    <option key={option} value={option}>
                      {formatPolicyOption(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span>Default Activation Trigger</span>
                <select
                  value={settings.policyDefaults.defaultActivationTrigger}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultActivationTrigger: event.target
                          .value as ManufacturerPolicyDefaults["defaultActivationTrigger"],
                      },
                    }))
                  }
                  disabled={
                    settings.policyDefaults.defaultActivationMode ===
                    "installation_driven"
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ACTIVATION_TRIGGERS.map((option) => (
                    <option key={option} value={option}>
                      {formatPolicyOption(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span>Default Customer Creation Mode</span>
                <select
                  value={settings.policyDefaults.defaultCustomerCreationMode}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultCustomerCreationMode: event.target
                          .value as ManufacturerPolicyDefaults["defaultCustomerCreationMode"],
                      },
                    }))
                  }
                  disabled={
                    settings.policyDefaults.defaultActivationMode ===
                    "installation_driven"
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {CUSTOMER_CREATION_MODES.map((option) => (
                    <option key={option} value={option}>
                      {formatPolicyOption(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span>Default Part Traceability Mode</span>
                <select
                  value={settings.policyDefaults.defaultPartTraceabilityMode}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultPartTraceabilityMode: event.target
                          .value as ManufacturerPolicyDefaults["defaultPartTraceabilityMode"],
                      },
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PART_TRACEABILITY_MODES.map((option) => (
                    <option key={option} value={option}>
                      {formatPolicyOption(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span>Default Small-Part Tracking Mode</span>
                <select
                  value={settings.policyDefaults.defaultSmallPartTrackingMode}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultSmallPartTrackingMode: event.target
                          .value as ManufacturerPolicyDefaults["defaultSmallPartTrackingMode"],
                      },
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {SMALL_PART_TRACKING_MODES.map((option) => (
                    <option key={option} value={option}>
                      {formatPolicyOption(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow
                label="Allow Carton Sale Registration by Default"
                checked={settings.policyDefaults.defaultAllowCartonSaleRegistration}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    policyDefaults: {
                      ...current.policyDefaults,
                      defaultAllowCartonSaleRegistration: checked,
                    },
                  }))
                }
              />
              <ToggleRow
                label="Allow Unit Self-Activation by Default"
                checked={settings.policyDefaults.defaultAllowUnitSelfActivation}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    policyDefaults: {
                      ...current.policyDefaults,
                      defaultAllowUnitSelfActivation: checked,
                    },
                  }))
                }
              />
              <ToggleRow
                label="Require Customer Acknowledgement by Default"
                checked={settings.policyDefaults.defaultAcknowledgementRequired}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    policyDefaults: {
                      ...current.policyDefaults,
                      defaultAcknowledgementRequired: checked,
                    },
                  }))
                }
              />
              <ToggleRow
                label="Require Geo Capture by Default"
                checked={settings.policyDefaults.defaultRequiredGeoCapture}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    policyDefaults: {
                      ...current.policyDefaults,
                      defaultRequiredGeoCapture: checked,
                    },
                  }))
                }
              />
              <ToggleRow
                label="ERP Inbound Enabled"
                checked={settings.policyDefaults.erpInboundEnabled}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    policyDefaults: {
                      ...current.policyDefaults,
                      erpInboundEnabled: checked,
                    },
                  }))
                }
              />
              <ToggleRow
                label="ERP Outbound Enabled"
                checked={settings.policyDefaults.erpOutboundEnabled}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    policyDefaults: {
                      ...current.policyDefaults,
                      erpOutboundEnabled: checked,
                    },
                  }))
                }
              />
            </div>

            <TagInput
              label="Default Installation Checklist Template"
              placeholder="Press Enter to add checklist step"
              value={settings.policyDefaults.defaultChecklistTemplate}
              onChange={(next: string[]) =>
                setSettings((current) => ({
                  ...current,
                  policyDefaults: {
                    ...current.policyDefaults,
                    defaultChecklistTemplate: next,
                  },
                }))
              }
            />

            <TagInput
              label="Default Commissioning Template"
              placeholder="Press Enter to add commissioning field"
              value={settings.policyDefaults.defaultCommissioningTemplate}
              onChange={(next: string[]) =>
                setSettings((current) => ({
                  ...current,
                  policyDefaults: {
                    ...current.policyDefaults,
                    defaultCommissioningTemplate: next,
                  },
                }))
              }
            />

            <TagInput
              label="Default Installer Skill Tags"
              placeholder="Press Enter to add installer skill tag"
              value={settings.policyDefaults.defaultInstallerSkillTags}
              onChange={(next: string[]) =>
                setSettings((current) => ({
                  ...current,
                  policyDefaults: {
                    ...current.policyDefaults,
                    defaultInstallerSkillTags: next,
                  },
                }))
              }
            />

            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
              <label className="flex items-center justify-between gap-3 text-sm sm:col-span-1">
                <span>Require Before Photo</span>
                <input
                  type="checkbox"
                  checked={
                    settings.policyDefaults.defaultRequiredPhotoPolicy
                      .requireBeforePhoto
                  }
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultRequiredPhotoPolicy: {
                          ...current.policyDefaults.defaultRequiredPhotoPolicy,
                          requireBeforePhoto: event.target.checked,
                        },
                      },
                    }))
                  }
                  className="h-4 w-4 rounded border-input"
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm sm:col-span-1">
                <span>Require After Photo</span>
                <input
                  type="checkbox"
                  checked={
                    settings.policyDefaults.defaultRequiredPhotoPolicy
                      .requireAfterPhoto
                  }
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultRequiredPhotoPolicy: {
                          ...current.policyDefaults.defaultRequiredPhotoPolicy,
                          requireAfterPhoto: event.target.checked,
                        },
                      },
                    }))
                  }
                  className="h-4 w-4 rounded border-input"
                />
              </label>

              <label className="space-y-1 text-sm sm:col-span-1">
                <span>Minimum Photo Count</span>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={
                    settings.policyDefaults.defaultRequiredPhotoPolicy
                      .minimumPhotoCount
                  }
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      policyDefaults: {
                        ...current.policyDefaults,
                        defaultRequiredPhotoPolicy: {
                          ...current.policyDefaults.defaultRequiredPhotoPolicy,
                          minimumPhotoCount: Math.min(
                            20,
                            sanitizeHours(event.target.value),
                          ),
                        },
                      },
                    }))
                  }
                />
              </label>
            </div>
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
            <CardTitle>Notification Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow
              label="Warranty Activated"
              checked={settings.notifications.events.warrantyActivated}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    events: {
                      ...current.notifications.events,
                      warrantyActivated: checked,
                    },
                  },
                }))
              }
            />
            <ToggleRow
              label="Ticket Created"
              checked={settings.notifications.events.ticketCreated}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    events: {
                      ...current.notifications.events,
                      ticketCreated: checked,
                    },
                  },
                }))
              }
            />
            <ToggleRow
              label="Technician Updates"
              checked={settings.notifications.events.technicianUpdates}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    events: {
                      ...current.notifications.events,
                      technicianUpdates: checked,
                    },
                  },
                }))
              }
            />
            <ToggleRow
              label="Claim Submitted"
              checked={settings.notifications.events.claimSubmitted}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    events: {
                      ...current.notifications.events,
                      claimSubmitted: checked,
                    },
                  },
                }))
              }
            />
            <ToggleRow
              label="Claim Decision"
              checked={settings.notifications.events.claimDecision}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    events: {
                      ...current.notifications.events,
                      claimDecision: checked,
                    },
                  },
                }))
              }
            />
            <ToggleRow
              label="Warranty Expiring"
              checked={settings.notifications.events.warrantyExpiring}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    events: {
                      ...current.notifications.events,
                      warrantyExpiring: checked,
                    },
                  },
                }))
              }
            />
            <ToggleRow
              label="SLA Breached"
              checked={settings.notifications.events.slaBreached}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  notifications: {
                    ...current.notifications,
                    events: {
                      ...current.notifications.events,
                      slaBreached: checked,
                    },
                  },
                }))
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Keys & Integrations</CardTitle>
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
              <span>API Key Label</span>
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
            <label className="space-y-1 text-sm">
              <span>Stored API Key (masked)</span>
              <Input
                value={settings.integrations.erpApiKeyMasked}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    integrations: {
                      ...current.integrations,
                      erpApiKeyMasked: event.target.value,
                    },
                  }))
                }
                placeholder="sk_live_****************"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Key vault integration is a placeholder for MVP. Use this section
              to track active key labels and rotation metadata.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create the user in Clerk first, then link them here as a
            manufacturer admin.
          </p>

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              value={inviteDraft.clerkId}
              onChange={(event) =>
                setInviteDraft((current) => ({
                  ...current,
                  clerkId: event.target.value,
                }))
              }
              placeholder="Clerk User ID (user_...)"
            />
            <Input
              value={inviteDraft.name}
              onChange={(event) =>
                setInviteDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Name (optional)"
            />
            <Input
              value={inviteDraft.email}
              onChange={(event) =>
                setInviteDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="Email (optional)"
              type="email"
            />
            <Button
              onClick={() => void inviteTeamMember()}
              disabled={isInviting}
              className="gap-2"
            >
              {isInviting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Add Member
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-2 text-left font-medium">Name</th>
                  <th className="px-2 py-2 text-left font-medium">Email</th>
                  <th className="px-2 py-2 text-left font-medium">Clerk ID</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-left font-medium">Linked</th>
                  <th className="px-2 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-muted-foreground">
                      No manufacturer admin members linked yet.
                    </td>
                  </tr>
                ) : (
                  teamMembers.map((member) => (
                    <tr key={member.id} className="border-b">
                      <td className="px-2 py-2">{member.name || "-"}</td>
                      <td className="px-2 py-2">{member.email || "-"}</td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {member.clerkId}
                      </td>
                      <td className="px-2 py-2">
                        <Badge
                          variant="outline"
                          className={
                            member.isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                          }
                        >
                          {member.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={togglingMemberId === member.id}
                          onClick={() =>
                            void toggleTeamMemberStatus(
                              member.id,
                              !member.isActive,
                            )
                          }
                        >
                          {togglingMemberId === member.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : member.isActive ? (
                            "Deactivate"
                          ) : (
                            "Activate"
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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

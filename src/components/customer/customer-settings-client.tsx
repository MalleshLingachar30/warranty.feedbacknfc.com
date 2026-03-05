"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "kn", label: "Kannada" },
  { value: "te", label: "Telugu" },
  { value: "ar", label: "Arabic" },
] as const;

type CustomerSettingsClientProps = {
  initialLanguage: string;
  profile: {
    name: string;
    email: string;
    phone: string;
  };
};

async function updateCustomerSettings(languagePreference: string) {
  const response = await fetch("/api/customer/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ languagePreference }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to update settings.");
  }
}

export function CustomerSettingsClient({
  initialLanguage,
  profile,
}: CustomerSettingsClientProps) {
  const [languagePreference, setLanguagePreference] =
    useState<string>(initialLanguage);
  const [isPending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const toastId = toast.loading("Saving settings…");

      try {
        await updateCustomerSettings(languagePreference);
        toast.success("Settings saved.", { id: toastId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save.", {
          id: toastId,
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            This information is linked from your account and warranty activations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">Name:</span>{" "}
            {profile.name || "—"}
          </p>
          <p>
            <span className="font-medium text-slate-900">Email:</span>{" "}
            {profile.email || "—"}
          </p>
          <p>
            <span className="font-medium text-slate-900">Phone:</span>{" "}
            {profile.phone || "—"}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
          <CardDescription>
            Choose your preferred language for SMS and portal content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-900">
              Language
            </label>
            <select
              value={languagePreference}
              onChange={(event) => setLanguagePreference(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={onSave} disabled={isPending} className="h-11">
            {isPending ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


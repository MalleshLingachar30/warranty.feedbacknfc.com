"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low", dotClass: "bg-slate-500" },
  { value: "medium", label: "Medium", dotClass: "bg-yellow-500" },
  { value: "high", label: "High", dotClass: "bg-orange-500" },
  { value: "critical", label: "Critical", dotClass: "bg-red-500" },
] as const;

type SeverityValue = (typeof SEVERITY_OPTIONS)[number]["value"];

interface CreatedTicketPayload {
  id: string;
  ticketNumber: string;
  status: string;
}

interface CreateTicketResponse {
  success?: boolean;
  error?: string;
  ticket?: {
    id?: string;
    ticketNumber?: string;
    status?: string;
  };
}

interface UploadPhotoResponse {
  error?: string;
  urls?: string[];
  url?: string | null;
}

export interface ReportIssueFormProps {
  productId: string;
  issueOptions: string[];
  defaultPhone?: string;
  defaultCustomerName?: string;
  className?: string;
  onCreated?: (ticket: CreatedTicketPayload) => void;
}

async function uploadPhotos(files: File[]): Promise<string[]> {
  if (files.length === 0) {
    return [];
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("photos", file));

  const response = await fetch("/api/upload/photo", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as UploadPhotoResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to upload photo.");
  }

  const urls = Array.isArray(payload.urls)
    ? payload.urls.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (urls.length > 0) {
    return urls;
  }

  if (typeof payload.url === "string" && payload.url.trim().length > 0) {
    return [payload.url];
  }

  return [];
}

export function ReportIssueForm({
  productId,
  issueOptions,
  defaultPhone,
  defaultCustomerName,
  className,
  onCreated,
}: ReportIssueFormProps) {
  const normalizedIssueOptions = useMemo(
    () => issueOptions.map((entry) => entry.trim()).filter(Boolean),
    [issueOptions],
  );

  const [issueCategory, setIssueCategory] = useState(
    normalizedIssueOptions[0] ?? "General issue",
  );
  const [issueDescription, setIssueDescription] = useState("");
  const [severity, setSeverity] = useState<SeverityValue>("medium");
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone ?? "");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 5) {
      setErrorMessage("You can upload up to 5 photos.");
      setPhotoFiles(files.slice(0, 5));
      return;
    }

    setErrorMessage(null);
    setPhotoFiles(files);
  };

  const resetForm = () => {
    setIssueDescription("");
    setSeverity("medium");
    setPhotoFiles([]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!issueCategory || issueCategory.trim().length === 0) {
      setErrorMessage("Select an issue category.");
      return;
    }

    if (issueDescription.trim().length < 10) {
      setErrorMessage("Issue description should be at least 10 characters.");
      return;
    }

    if (phoneNumber.trim().length < 8) {
      setErrorMessage("Enter a valid phone number.");
      return;
    }

    setIsSubmitting(true);

    try {
      const issuePhotos = await uploadPhotos(photoFiles);

      const response = await fetch("/api/ticket/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          issueCategory,
          issueDescription: issueDescription.trim(),
          issueSeverity: severity,
          issuePhotos,
          reportedByPhone: phoneNumber.trim(),
          reportedByName: defaultCustomerName ?? "Customer",
          // Compatibility aliases for older payload contracts.
          severity,
          photos: issuePhotos,
          customerPhone: phoneNumber.trim(),
          customerName: defaultCustomerName ?? "Customer",
        }),
      });

      const payload = (await response.json()) as CreateTicketResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create service request.");
      }

      const ticketId = payload.ticket?.id ?? "";
      const ticketNumber = payload.ticket?.ticketNumber ?? "WRT-XXXXXX";
      const ticketStatus = payload.ticket?.status ?? "reported";

      setSuccessMessage(`Service request created. Ticket #${ticketNumber}.`);
      resetForm();

      if (ticketId && onCreated) {
        onCreated({
          id: ticketId,
          ticketNumber,
          status: ticketStatus,
        });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create service request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className={cn("border-slate-200", className)}>
      <CardHeader>
        <CardTitle className="text-base">Report Issue</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="issue-category"
              className="text-sm font-medium text-slate-800"
            >
              Issue category
            </label>
            <select
              id="issue-category"
              value={issueCategory}
              onChange={(event) => setIssueCategory(event.target.value)}
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
              required
            >
              {normalizedIssueOptions.length > 0 ? (
                normalizedIssueOptions.map((issue) => (
                  <option key={issue} value={issue}>
                    {issue}
                  </option>
                ))
              ) : (
                <option value="General issue">General issue</option>
              )}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="issue-description"
              className="text-sm font-medium text-slate-800"
            >
              Issue description
            </label>
            <Textarea
              id="issue-description"
              value={issueDescription}
              onChange={(event) => setIssueDescription(event.target.value)}
              className="min-h-24"
              placeholder="Describe the issue in detail"
              required
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-800">
              Issue severity
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {SEVERITY_OPTIONS.map((option) => {
                const selected = severity === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSeverity(option.value)}
                    className={cn(
                      "flex h-11 items-center justify-between rounded-md border px-3 text-sm",
                      selected
                        ? "border-blue-400 bg-blue-50 text-blue-900"
                        : "border-slate-300 bg-white text-slate-700",
                    )}
                  >
                    <span>{option.label}</span>
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        option.dotClass,
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label
              htmlFor="photo-upload"
              className="text-sm font-medium text-slate-800"
            >
              Photos (up to 5)
            </label>
            <Input
              id="photo-upload"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handlePhotoSelection}
            />
            {photoFiles.length > 0 ? (
              <div className="space-y-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-700">
                {photoFiles.map((file) => (
                  <p
                    key={`${file.name}-${file.lastModified}`}
                    className="flex items-center gap-1"
                  >
                    <Camera className="h-3 w-3" />
                    {file.name}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="phone-number"
              className="text-sm font-medium text-slate-800"
            >
              Customer phone number
            </label>
            <Input
              id="phone-number"
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="Enter phone number"
              required
            />
          </div>

          {errorMessage ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          ) : null}

          {successMessage ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{successMessage}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Badge
              variant="outline"
              className="h-11 border-slate-300 px-3 text-xs text-slate-700"
            >
              Mobile camera supported
            </Badge>
            <Button
              type="submit"
              className="h-11 min-w-36"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

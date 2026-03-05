"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Camera, Clock3, MapPin, Phone, ShieldCheck } from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ServiceHistoryItem,
  WarrantyProduct,
  WarrantyProductModel,
  WarrantyTicket,
  WarrantyTicketSeverity,
} from "@/lib/warranty-types";

interface CustomerProductViewProps {
  stickerNumber: number;
  product: WarrantyProduct;
  productModel: WarrantyProductModel;
  openTicket: WarrantyTicket | null;
  serviceHistory: ServiceHistoryItem[];
}

const severityOptions: Array<{
  value: WarrantyTicketSeverity;
  label: string;
  indicatorClass: string;
}> = [
  { value: "low", label: "Low", indicatorClass: "bg-emerald-500" },
  { value: "medium", label: "Medium", indicatorClass: "bg-amber-500" },
  { value: "high", label: "High", indicatorClass: "bg-orange-500" },
  { value: "critical", label: "Critical", indicatorClass: "bg-red-500" },
];

function formatDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateValue));
}

function formatDurationFromNow(dateValue: string) {
  const now = Date.now();
  const then = new Date(dateValue).getTime();
  const diffInMs = Math.max(0, now - then);
  const hours = Math.floor(diffInMs / (1000 * 60 * 60));

  if (hours < 1) {
    return "just now";
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function daysUntil(dateValue: string) {
  const end = new Date(dateValue).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

function ticketStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read photo"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read photo"));
    reader.readAsDataURL(file);
  });
}

export function CustomerProductView({
  stickerNumber,
  product,
  productModel,
  openTicket,
  serviceHistory,
}: CustomerProductViewProps) {
  const issueCategories = useMemo(() => {
    if (productModel.commonIssues.length > 0) {
      return productModel.commonIssues;
    }

    return ["General issue"];
  }, [productModel.commonIssues]);

  const [showReportForm, setShowReportForm] = useState(false);
  const [issueCategory, setIssueCategory] = useState(issueCategories[0] ?? "General issue");
  const [issueDescription, setIssueDescription] = useState("");
  const [severity, setSeverity] = useState<WarrantyTicketSeverity>("medium");
  const [phoneNumber, setPhoneNumber] = useState(product.customerPhone ?? "");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const warrantyDaysRemaining = useMemo(() => daysUntil(product.warrantyEndDate), [product.warrantyEndDate]);
  const canReportIssue = product.warrantyStatus === "active" && !openTicket;

  const handlePhotoSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 5) {
      setSubmitError("You can upload up to 5 photos.");
      setPhotoFiles(files.slice(0, 5));
      return;
    }

    setSubmitError(null);
    setPhotoFiles(files);
  };

  const resetForm = () => {
    setIssueDescription("");
    setSeverity("medium");
    setPhotoFiles([]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccessMessage(null);

    if (!issueCategory) {
      setSubmitError("Select an issue category.");
      return;
    }

    if (issueDescription.trim().length < 10) {
      setSubmitError("Describe the issue with at least 10 characters.");
      return;
    }

    if (phoneNumber.trim().length < 8) {
      setSubmitError("Enter a valid phone number.");
      return;
    }

    setIsSubmitting(true);

    try {
      const photoPayload = await Promise.all(photoFiles.map((file) => fileToDataUrl(file)));

      const response = await fetch("/api/ticket/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
          stickerNumber,
          issueCategory,
          issueDescription,
          severity,
          photos: photoPayload,
          customerPhone: phoneNumber,
          customerName: product.customerName,
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to submit service request");
      }

      setSubmitSuccessMessage(
        payload.message ??
          "Service request submitted! Ticket #WRT-2026-XXXXXX. A technician will be assigned shortly."
      );
      resetForm();
      setShowReportForm(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to submit service request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NfcPublicShell
      title={productModel.name}
      description={`Model ${productModel.modelNumber} • Serial ${product.serialNumber}`}
      footer={`Sticker #${stickerNumber} • Warranty managed by ${product.organizationName}`}
    >
      <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Warranty Status</p>
            <p className="text-xs text-slate-600">Valid until {formatDate(product.warrantyEndDate)}</p>
          </div>
          <Badge className="bg-emerald-600 text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
            Active
          </Badge>
        </div>
        <p className="text-sm text-slate-700">
          {warrantyDaysRemaining} day{warrantyDaysRemaining === 1 ? "" : "s"} remaining
        </p>
      </section>

      {openTicket ? (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">Open Service Request</p>
              <p className="text-xs text-amber-800">Ticket #{openTicket.ticketNumber}</p>
            </div>
            <Badge variant="outline" className="border-amber-300 text-amber-800">
              {ticketStatusLabel(openTicket.status)}
            </Badge>
          </div>
          <p className="text-sm text-amber-900">{openTicket.issueDescription}</p>
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <Clock3 className="h-3.5 w-3.5" />
            Reported {formatDurationFromNow(openTicket.reportedAt)}
          </div>
        </section>
      ) : null}

      {canReportIssue ? (
        <section className="space-y-3">
          {!showReportForm ? (
            <Button
              size="lg"
              className="h-12 w-full rounded-xl text-base"
              onClick={() => setShowReportForm(true)}
            >
              Report Issue
            </Button>
          ) : null}

          {showReportForm ? (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="space-y-2">
                <label htmlFor="issue-category" className="text-sm font-medium text-slate-800">
                  Issue category
                </label>
                <select
                  id="issue-category"
                  value={issueCategory}
                  onChange={(event) => setIssueCategory(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  required
                >
                  {issueCategories.map((issue) => (
                    <option key={issue} value={issue}>
                      {issue}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="issue-description" className="text-sm font-medium text-slate-800">
                  Issue description
                </label>
                <Textarea
                  id="issue-description"
                  value={issueDescription}
                  onChange={(event) => setIssueDescription(event.target.value)}
                  placeholder="Describe what is happening with the product"
                  className="min-h-24"
                  required
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-800">Issue severity</legend>
                <div className="grid grid-cols-2 gap-2">
                  {severityOptions.map((option) => {
                    const isSelected = severity === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex h-11 items-center justify-between rounded-md border px-3 text-sm ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-900"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                        onClick={() => setSeverity(option.value)}
                      >
                        <span>{option.label}</span>
                        <span className={`h-2.5 w-2.5 rounded-full ${option.indicatorClass}`} />
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="space-y-2">
                <label htmlFor="photo-upload" className="text-sm font-medium text-slate-800">
                  Upload photos (up to 5)
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
                  <div className="space-y-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-600">
                    {photoFiles.map((file) => (
                      <p key={file.name} className="flex items-center gap-1">
                        <Camera className="h-3 w-3" />
                        {file.name}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="phone-number" className="text-sm font-medium text-slate-800">
                  Phone number
                </label>
                <Input
                  id="phone-number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="Enter contact number"
                  required
                />
              </div>

              {submitError ? (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{submitError}</p>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => setShowReportForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="h-11 flex-1" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {submitSuccessMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {submitSuccessMessage}
        </div>
      ) : null}

      <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Product Information</h2>
        <div className="space-y-1 text-sm text-slate-700">
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-slate-500" />
            {product.customerPhone}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-500" />
            {product.customerAddress}
          </p>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Service History</h2>
        {serviceHistory.length === 0 ? (
          <p className="text-sm text-slate-600">No prior service activity found for this product.</p>
        ) : (
          <ul className="space-y-2">
            {serviceHistory.map((entry) => (
              <li key={entry.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{entry.issueCategory}</p>
                  <Badge variant="outline" className="capitalize">
                    {ticketStatusLabel(entry.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">{entry.ticketNumber}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(entry.reportedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </NfcPublicShell>
  );
}

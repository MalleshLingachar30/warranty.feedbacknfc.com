"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  AlertCircle,
  Camera,
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { NfcLanguage } from "@/lib/nfc-i18n";
import {
  getNfcCopy,
  translateSeverityLabel,
  translateTicketStatus,
} from "@/lib/nfc-i18n";
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
  certificateUrl: string | null;
  language: NfcLanguage;
  languageToggle?: ReactNode;
}

const severityOptionsBase: Array<{
  value: WarrantyTicketSeverity;
  indicatorClass: string;
}> = [
  { value: "low", indicatorClass: "bg-emerald-500" },
  { value: "medium", indicatorClass: "bg-amber-500" },
  { value: "high", indicatorClass: "bg-orange-500" },
  { value: "critical", indicatorClass: "bg-red-500" },
];

function formatDurationFromNow(dateValue: string, language: NfcLanguage) {
  const now = Date.now();
  const then = new Date(dateValue).getTime();
  const diffInMs = Math.max(0, now - then);
  const hours = Math.floor(diffInMs / (1000 * 60 * 60));

  if (hours < 1) {
    return language === "hi" ? "अभी" : "just now";
  }

  if (hours < 24) {
    return language === "hi" ? `${hours} घंटे पहले` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return language === "hi" ? `${days} दिन पहले` : `${days}d ago`;
}

function daysUntil(dateValue: string) {
  const end = new Date(dateValue).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
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
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read photo"));
    reader.readAsDataURL(file);
  });
}

function getCurrentLocationSnapshot() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve<{
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      capturedAt: string;
    } | null>(null);
  }

  return new Promise<{
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    capturedAt: string;
  } | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 120000,
      },
    );
  });
}

export function CustomerProductView({
  stickerNumber,
  product,
  productModel,
  openTicket,
  serviceHistory,
  certificateUrl,
  language,
  languageToggle,
}: CustomerProductViewProps) {
  const copy = getNfcCopy(language);
  const unavailable = language === "hi" ? "उपलब्ध नहीं" : "Not available";

  const issueCategories = useMemo(() => {
    if (productModel.commonIssues.length > 0) {
      return productModel.commonIssues;
    }

    return [copy.customerProductView.generalIssue];
  }, [copy.customerProductView.generalIssue, productModel.commonIssues]);

  const severityOptions = useMemo(
    () =>
      severityOptionsBase.map((option) => ({
        ...option,
        label: translateSeverityLabel(option.value, language),
      })),
    [language],
  );

  const [showReportForm, setShowReportForm] = useState(false);
  const [issueCategory, setIssueCategory] = useState(
    issueCategories[0] ?? copy.customerProductView.generalIssue,
  );
  const [issueDescription, setIssueDescription] = useState("");
  const [severity, setSeverity] = useState<WarrantyTicketSeverity>("medium");
  const [phoneNumber, setPhoneNumber] = useState(product.customerPhone ?? "");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const warrantyDaysRemaining = useMemo(
    () => daysUntil(product.warrantyEndDate),
    [product.warrantyEndDate],
  );
  const canReportIssue = product.warrantyStatus === "active" && !openTicket;
  const formatDateByLanguage = (dateValue: string) =>
    new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateValue));

  const managedByLabel =
    language === "hi" ? "वारंटी प्रबंधन" : "Warranty managed by";

  const handlePhotoSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 5) {
      setSubmitError(copy.customerProductView.uploadLimitError);
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
      setSubmitError(copy.customerProductView.selectIssueCategoryError);
      return;
    }

    if (issueDescription.trim().length < 10) {
      setSubmitError(copy.customerProductView.issueDescriptionError);
      return;
    }

    if (phoneNumber.trim().length < 8) {
      setSubmitError(copy.customerProductView.phoneValidationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const photoPayload = await Promise.all(
        photoFiles.map((file) => fileToDataUrl(file)),
      );
      const serviceLocation = await getCurrentLocationSnapshot();

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
          serviceLocation: serviceLocation ?? undefined,
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to submit service request");
      }

      setSubmitSuccessMessage(
        payload.message ?? copy.customerProductView.reportSuccessFallback,
      );
      resetForm();
      setShowReportForm(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : language === "hi"
            ? "सर्विस अनुरोध भेजा नहीं जा सका।"
            : "Unable to submit service request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NfcPublicShell
      title={productModel.name}
      description={`${copy.customerProductView.modelLabel} ${productModel.modelNumber ?? unavailable} • ${copy.customerProductView.serialLabel} ${product.serialNumber ?? unavailable}`}
      footer={`Sticker #${stickerNumber} • ${managedByLabel} ${product.organizationName}`}
      subtitle={copy.shellSubtitle}
      headerActions={languageToggle}
    >
      <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex justify-end">
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <ShieldCheck className="h-3.5 w-3.5" />
            {copy.customerProductView.verifiedOwnerBadge}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {copy.customerProductView.warrantyStatus}
            </p>
            <p className="text-xs text-slate-600">
              {copy.customerProductView.validUntil}{" "}
              {formatDateByLanguage(product.warrantyEndDate)}
            </p>
          </div>
          <Badge className="bg-emerald-600 text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
            {copy.customerProductView.activeBadge}
          </Badge>
        </div>
        <p className="text-sm text-slate-700">
          {warrantyDaysRemaining} {copy.customerProductView.daysRemaining}
        </p>
      </section>

      {certificateUrl && product.warrantyStatus === "active" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <Button asChild variant="outline" className="h-11 w-full">
            <a href={certificateUrl} target="_blank" rel="noreferrer">
              {copy.customerProductView.downloadCertificate}
            </a>
          </Button>
        </section>
      ) : null}

      {openTicket ? (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {copy.customerProductView.openServiceRequest}
              </p>
              <p className="text-xs text-amber-800">
                {copy.customerProductView.ticketLabel} #{openTicket.ticketNumber}
              </p>
            </div>
            <Badge variant="outline" className="border-amber-300 text-amber-800">
              {translateTicketStatus(openTicket.status, language)}
            </Badge>
          </div>
          <p className="text-sm text-amber-900">{openTicket.issueDescription}</p>
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <Clock3 className="h-3.5 w-3.5" />
            {copy.customerProductView.reported}{" "}
            {formatDurationFromNow(openTicket.reportedAt, language)}
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
              {copy.customerProductView.reportIssue}
            </Button>
          ) : null}

          {showReportForm ? (
            <form
              onSubmit={handleSubmit}
              className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="space-y-2">
                <label htmlFor="issue-category" className="text-sm font-medium text-slate-800">
                  {copy.customerProductView.issueCategory}
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
                <label
                  htmlFor="issue-description"
                  className="text-sm font-medium text-slate-800"
                >
                  {copy.customerProductView.issueDescription}
                </label>
                <Textarea
                  id="issue-description"
                  value={issueDescription}
                  onChange={(event) => setIssueDescription(event.target.value)}
                  placeholder={copy.customerProductView.issueDescriptionPlaceholder}
                  className="min-h-24"
                  required
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-800">
                  {copy.customerProductView.issueSeverity}
                </legend>
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
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${option.indicatorClass}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="space-y-2">
                <label htmlFor="photo-upload" className="text-sm font-medium text-slate-800">
                  {copy.customerProductView.uploadPhotos}
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
                  {copy.customerProductView.phoneNumber}
                </label>
                <Input
                  id="phone-number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder={copy.customerProductView.phonePlaceholder}
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
                  {copy.customerProductView.cancel}
                </Button>
                <Button type="submit" className="h-11 flex-1" disabled={isSubmitting}>
                  {isSubmitting
                    ? copy.customerProductView.submitting
                    : copy.customerProductView.submit}
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
        <h2 className="text-sm font-semibold text-slate-900">
          {copy.customerProductView.productInformation}
        </h2>
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
        <h2 className="text-sm font-semibold text-slate-900">
          {copy.customerProductView.serviceHistory}
        </h2>
        {serviceHistory.length === 0 ? (
          <p className="text-sm text-slate-600">
            {copy.customerProductView.noServiceHistory}
          </p>
        ) : (
          <ul className="space-y-2">
            {serviceHistory.map((entry) => (
              <li key={entry.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{entry.issueCategory}</p>
                  <Badge variant="outline" className="capitalize">
                    {translateTicketStatus(entry.status, language)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">{entry.ticketNumber}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateByLanguage(entry.reportedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </NfcPublicShell>
  );
}

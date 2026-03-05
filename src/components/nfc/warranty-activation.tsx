"use client";

import { type ReactNode, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { ProductView } from "@/components/nfc/types";
import { formatDate, toDate } from "@/components/nfc/types";
import type { NfcLanguage } from "@/lib/nfc-i18n";
import { getNfcCopy } from "@/lib/nfc-i18n";

interface WarrantyActivationProps {
  product: ProductView;
  language: NfcLanguage;
  languageToggle?: ReactNode;
}

interface ActivationFormState {
  customerName: string;
  customerPhone: string;
  otpCode: string;
  customerEmail: string;
  customerAddress: string;
  installationDate: string;
}

interface ActivationSuccess {
  warrantyEndDate: string;
  certificateUrl: string | null;
}

function monthLabel(months: number, language: NfcLanguage, suffix: string) {
  if (months % 12 === 0) {
    const years = months / 12;
    if (language === "hi") {
      return `${years} वर्ष ${suffix}`;
    }
    return `${years} Year${years > 1 ? "s" : ""} ${suffix}`;
  }

  if (language === "hi") {
    return `${months} माह ${suffix}`;
  }

  return `${months} Month ${suffix}`;
}

export function WarrantyActivation({
  product,
  language,
  languageToggle,
}: WarrantyActivationProps) {
  const copy = getNfcCopy(language);
  const defaultInstallationDate = useMemo(() => {
    const existingDate = toDate(product.installationDate);
    if (existingDate) {
      return existingDate.toISOString().slice(0, 10);
    }

    return new Date().toISOString().slice(0, 10);
  }, [product.installationDate]);

  const [formState, setFormState] = useState<ActivationFormState>({
    customerName: product.customerName ?? "",
    customerPhone: product.customerPhone ?? "",
    otpCode: "",
    customerEmail: product.customerEmail ?? "",
    customerAddress: product.customerAddress ?? "",
    installationDate: defaultInstallationDate,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ActivationSuccess | null>(null);

  const warrantyDuration = monthLabel(
    product.model?.warrantyDurationMonths ?? 12,
    language,
    copy.warrantyActivation.warrantyDurationSuffix,
  );

  const onFieldChange = (field: keyof ActivationFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/warranty/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
          customerName: formState.customerName,
          customerPhone: formState.customerPhone,
          otpCode: formState.otpCode,
          customerEmail: formState.customerEmail || null,
          customerAddress: formState.customerAddress || null,
          installationDate: formState.installationDate,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        warrantyEndDate?: string;
        certificateUrl?: string;
      };

      if (!response.ok || !payload.warrantyEndDate) {
        setError(
          payload.error ??
            (language === "hi"
              ? "वारंटी सक्रिय नहीं हो सकी। कृपया दोबारा प्रयास करें।"
              : "Unable to activate warranty. Please try again."),
        );
        return;
      }

      setSuccess({
        warrantyEndDate: payload.warrantyEndDate,
        certificateUrl: payload.certificateUrl ?? null,
      });
    } catch {
      setError(copy.warrantyActivation.networkError);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <NfcPublicShell
        title={copy.warrantyActivation.activatedTitle}
        description={`${copy.warrantyActivation.activatedDescription} ${formatDate(success.warrantyEndDate)}.`}
        footer={copy.warrantyActivation.activatedFooter}
        subtitle={copy.shellSubtitle}
        headerActions={languageToggle}
      >
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="text-sm text-emerald-900">
            {copy.warrantyActivation.activatedSuccess}
          </p>
          {success.certificateUrl ? (
            <a href={success.certificateUrl} target="_blank" rel="noreferrer">
              <Button className="mt-4" variant="outline">
                {copy.warrantyActivation.downloadCertificate}
              </Button>
            </a>
          ) : null}
        </div>
      </NfcPublicShell>
    );
  }

  return (
    <NfcPublicShell
      title={copy.warrantyActivation.title}
      description={copy.warrantyActivation.description}
      footer={copy.warrantyActivation.footer}
      subtitle={copy.shellSubtitle}
      headerActions={languageToggle}
    >
      <Card className="border-slate-200">
        <CardContent className="space-y-4 p-4">
          {product.model?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.model.imageUrl}
              alt={product.model.name}
              className="h-36 w-full rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-36 w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
              {copy.warrantyActivation.productImage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              {product.model?.name ?? copy.customerProductView.productLabel}
            </p>
            <p>
              {copy.warrantyActivation.modelLabel}:{" "}
              {product.model?.modelNumber ?? (language === "hi" ? "उपलब्ध नहीं" : "Not available")}
            </p>
            <p>
              {copy.warrantyActivation.manufacturerLabel}:{" "}
              {product.organizationName ?? (language === "hi" ? "उपलब्ध नहीं" : "Not available")}
            </p>
            <p>
              {copy.warrantyActivation.serialLabel}:{" "}
              {product.serialNumber ?? (language === "hi" ? "उपलब्ध नहीं" : "Not available")}
            </p>
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
              <Shield className="h-4 w-4" />
              <p>{warrantyDuration}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label htmlFor="customerName" className="text-sm font-medium text-slate-700">
            {copy.warrantyActivation.customerName}{" "}
            <span className="text-rose-600">{copy.warrantyActivation.requiredIndicator}</span>
          </label>
          <Input
            id="customerName"
            required
            value={formState.customerName}
            onChange={(event) => onFieldChange("customerName", event.target.value)}
            placeholder={copy.warrantyActivation.customerName}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="customerPhone" className="text-sm font-medium text-slate-700">
            {copy.warrantyActivation.phoneNumber}{" "}
            <span className="text-rose-600">{copy.warrantyActivation.requiredIndicator}</span>
          </label>
          <Input
            id="customerPhone"
            required
            value={formState.customerPhone}
            onChange={(event) => onFieldChange("customerPhone", event.target.value)}
            placeholder={copy.warrantyActivation.phoneNumber}
            inputMode="tel"
          />
          <Input
            value={formState.otpCode}
            onChange={(event) => onFieldChange("otpCode", event.target.value)}
            placeholder={copy.warrantyActivation.otpPlaceholder}
            inputMode="numeric"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="customerEmail" className="text-sm font-medium text-slate-700">
            {copy.warrantyActivation.emailOptional}
          </label>
          <Input
            id="customerEmail"
            type="email"
            value={formState.customerEmail}
            onChange={(event) => onFieldChange("customerEmail", event.target.value)}
            placeholder="name@example.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="customerAddress" className="text-sm font-medium text-slate-700">
            {copy.warrantyActivation.addressOptional}
          </label>
          <textarea
            id="customerAddress"
            value={formState.customerAddress}
            onChange={(event) => onFieldChange("customerAddress", event.target.value)}
            placeholder={copy.warrantyActivation.addressOptional}
            className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="installationDate" className="text-sm font-medium text-slate-700">
            {copy.warrantyActivation.installationDate}
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              id="installationDate"
              type="date"
              value={formState.installationDate}
              onChange={(event) => onFieldChange("installationDate", event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isSubmitting
            ? copy.warrantyActivation.activatingButton
            : copy.warrantyActivation.activateButton}
        </Button>
      </form>
    </NfcPublicShell>
  );
}

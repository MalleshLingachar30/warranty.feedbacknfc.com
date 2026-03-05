"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NfcPublicShell } from "@/components/nfc/public-shell";
import type { ProductView } from "@/components/nfc/types";
import { formatDate, toDate } from "@/components/nfc/types";

interface WarrantyActivationProps {
  product: ProductView;
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

function monthLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} Year${years > 1 ? "s" : ""} Manufacturer Warranty`;
  }

  return `${months} Month Manufacturer Warranty`;
}

export function WarrantyActivation({ product }: WarrantyActivationProps) {
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

  const warrantyDuration = monthLabel(product.model?.warrantyDurationMonths ?? 12);

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
        setError(payload.error ?? "Unable to activate warranty. Please try again.");
        return;
      }

      setSuccess({
        warrantyEndDate: payload.warrantyEndDate,
        certificateUrl: payload.certificateUrl ?? null,
      });
    } catch {
      setError("Network error while activating warranty. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <NfcPublicShell
        title="Warranty Activated"
        description={`Warranty Activated! Valid until ${formatDate(success.warrantyEndDate)}.`}
        footer="You can scan this sticker anytime to raise a service request and track progress."
      >
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="text-sm text-emerald-900">
            Warranty activation completed successfully.
          </p>
          {success.certificateUrl ? (
            <a href={success.certificateUrl} target="_blank" rel="noreferrer">
              <Button className="mt-4" variant="outline">
                Download Warranty Certificate
              </Button>
            </a>
          ) : null}
        </div>
      </NfcPublicShell>
    );
  }

  return (
    <NfcPublicShell
      title="Activate Product Warranty"
      description="Complete this one-time form to activate your warranty and unlock service support."
      footer="OTP verification is currently stubbed for MVP testing."
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
              Product Image
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">{product.model?.name ?? "Product"}</p>
            <p>Model: {product.model?.modelNumber ?? "Not available"}</p>
            <p>Manufacturer: {product.organizationName ?? "Not available"}</p>
            <p>Serial Number: {product.serialNumber ?? "Not available"}</p>
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
            Customer Name <span className="text-rose-600">*</span>
          </label>
          <Input
            id="customerName"
            required
            value={formState.customerName}
            onChange={(event) => onFieldChange("customerName", event.target.value)}
            placeholder="Enter your full name"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="customerPhone" className="text-sm font-medium text-slate-700">
            Phone Number <span className="text-rose-600">*</span>
          </label>
          <Input
            id="customerPhone"
            required
            value={formState.customerPhone}
            onChange={(event) => onFieldChange("customerPhone", event.target.value)}
            placeholder="Enter mobile number"
            inputMode="tel"
          />
          <Input
            value={formState.otpCode}
            onChange={(event) => onFieldChange("otpCode", event.target.value)}
            placeholder="Enter OTP (stubbed for now)"
            inputMode="numeric"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="customerEmail" className="text-sm font-medium text-slate-700">
            Email (Optional)
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
            Address (Optional)
          </label>
          <textarea
            id="customerAddress"
            value={formState.customerAddress}
            onChange={(event) => onFieldChange("customerAddress", event.target.value)}
            placeholder="Installation address"
            className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="installationDate" className="text-sm font-medium text-slate-700">
            Installation Date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              id="installationDate"
              type="date"
              value={formState.installationDate}
              onChange={(event) =>
                onFieldChange("installationDate", event.target.value)
              }
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
          Activate Warranty
        </Button>
      </form>
    </NfcPublicShell>
  );
}

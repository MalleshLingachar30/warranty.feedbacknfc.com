"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NfcLanguage } from "@/lib/nfc-i18n";
import { getNfcCopy } from "@/lib/nfc-i18n";
import type {
  WarrantyProduct,
  WarrantyProductModel,
} from "@/lib/warranty-types";

interface PublicProductViewProps {
  product: WarrantyProduct;
  productModel: WarrantyProductModel;
  language: NfcLanguage;
  languageToggle?: ReactNode;
}

function formatDateByLanguage(
  value: string,
  language: NfcLanguage,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function PublicProductView({
  product,
  productModel,
  language,
  languageToggle,
}: PublicProductViewProps) {
  const copy = getNfcCopy(language);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isExpired = useMemo(() => {
    const endDate = new Date(product.warrantyEndDate);
    return !Number.isNaN(endDate.getTime()) && endDate.getTime() < Date.now();
  }, [product.warrantyEndDate]);

  const requestOtp = async () => {
    const response = await fetch("/api/otp/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: phoneNumber,
        productId: product.id,
        purpose: "general_access",
      }),
    });

    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      if (payload.error === "phone_mismatch") {
        setError(copy.publicProductView.phoneMismatchMessage);
        return;
      }

      setError(payload.message ?? payload.error ?? copy.publicProductView.networkError);
      return;
    }

    setOtpRequested(true);
    setMessage(payload.message ?? copy.publicProductView.otpSentMessage);
  };

  const verifyOtp = async () => {
    const response = await fetch("/api/otp/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: phoneNumber,
        productId: product.id,
        otp: otpCode,
      }),
    });

    const payload = (await response.json()) as {
      error?: string;
      message?: string;
      attemptsRemaining?: number;
    };

    if (!response.ok) {
      if (
        payload.error === "wrong_otp" &&
        typeof payload.attemptsRemaining === "number"
      ) {
        setError(
          `${copy.publicProductView.wrongOtpPrefix} ${payload.attemptsRemaining} ${copy.publicProductView.attemptsRemainingSuffix}`,
        );
        return;
      }

      setError(payload.message ?? payload.error ?? copy.publicProductView.networkError);
      return;
    }

    window.location.reload();
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (!otpRequested) {
        await requestOtp();
      } else {
        await verifyOtp();
      }
    } catch {
      setError(copy.publicProductView.networkError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NfcPublicShell
      title={productModel.name}
      description={`${copy.customerProductView.modelLabel} ${productModel.modelNumber || "-"} • ${copy.customerProductView.manufacturerLabel} ${product.organizationName}`}
      footer={copy.publicProductView.ownerProtectedMessage}
      subtitle={copy.shellSubtitle}
      headerActions={languageToggle}
    >
      <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {copy.publicProductView.warrantyStatus}
            </p>
            <p className="text-xs text-slate-600">
              {copy.publicProductView.validUntil}{" "}
              {formatDateByLanguage(product.warrantyEndDate, language)}
            </p>
          </div>
          <Badge className={isExpired ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {isExpired
              ? copy.publicProductView.expiredBadge
              : copy.publicProductView.activeBadge}
          </Badge>
        </div>
        {productModel.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={productModel.imageUrl}
            alt={productModel.name}
            className="h-36 w-full rounded-lg object-cover"
          />
        ) : null}
      </section>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">
            {copy.publicProductView.ownerPromptTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <p className="text-sm text-slate-600">
              {copy.publicProductView.ownerPromptDescription}
            </p>
            <div className="space-y-2">
              <label htmlFor="public-owner-phone" className="text-sm font-medium text-slate-700">
                {copy.publicProductView.phoneLabel}
              </label>
              <Input
                id="public-owner-phone"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder={copy.publicProductView.phoneLabel}
                inputMode="tel"
                required
              />
              <p className="text-xs text-slate-500">
                {copy.publicProductView.phoneHint}
              </p>
            </div>

            {otpRequested ? (
              <div className="space-y-2">
                <label htmlFor="public-owner-otp" className="text-sm font-medium text-slate-700">
                  {copy.publicProductView.otpLabel}
                </label>
                <Input
                  id="public-owner-otp"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value)}
                  placeholder={copy.publicProductView.otpPlaceholder}
                  inputMode="numeric"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setError(null);
                    setMessage(null);
                    setIsSubmitting(true);
                    try {
                      await requestOtp();
                    } catch {
                      setError(copy.publicProductView.networkError);
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  {copy.publicProductView.resendOtp}
                </Button>
              </div>
            ) : null}

            {message ? (
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                {message}
              </p>
            ) : null}

            {error ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <Button className="h-11 w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {copy.publicProductView.verifyWithOtp}
            </Button>
          </form>
        </CardContent>
      </Card>
    </NfcPublicShell>
  );
}

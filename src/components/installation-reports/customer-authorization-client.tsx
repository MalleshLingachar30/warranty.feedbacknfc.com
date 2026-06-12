"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Loader2, ShieldCheck } from "lucide-react";

import { NfcPublicShell } from "@/components/nfc/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CustomerInstallationReportAuthorizationProps = {
  reportId: string;
  productId: string;
  productName: string;
  modelNumber: string | null;
  assetCode: string;
  unitSerialNumber: string;
  customerName: string;
  customerPhone: string;
  installationDateLabel: string;
  geoLocationLabel: string | null;
  geoLocationUrl: string | null;
  submittedAtLabel: string;
  pdfUrl: string;
  authorizationUrl: string;
  customerAuthorizedAt: string | null;
  customerAuthorizedByName: string | null;
  certificateUrl: string | null;
};

type SuccessState = {
  certificateUrl: string | null;
  authorizedAtLabel: string;
};

export function CustomerInstallationReportAuthorizationClient(
  props: CustomerInstallationReportAuthorizationProps,
) {
  const [authorizedByName, setAuthorizedByName] = useState(
    props.customerAuthorizedByName ?? props.customerName,
  );
  const [otpCode, setOtpCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(
    props.customerAuthorizedAt
      ? {
          certificateUrl: props.certificateUrl,
          authorizedAtLabel: props.customerAuthorizedAt,
        }
      : null,
  );

  const requestOtp = async () => {
    const response = await fetch("/api/otp/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: props.customerPhone,
        productId: props.productId,
        purpose: "activation",
      }),
    });

    const payload = (await response.json()) as {
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        payload.message ?? payload.error ?? "Unable to send OTP right now.",
      );
    }

    setOtpRequested(true);
    setOtpMessage(payload.message ?? "OTP sent to the customer phone.");
  };

  const verifyOtp = async () => {
    const response = await fetch("/api/otp/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: props.productId,
        phone: props.customerPhone,
        otp: otpCode,
      }),
    });

    const payload = (await response.json()) as {
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        payload.message ?? payload.error ?? "Unable to verify the OTP.",
      );
    }
  };

  const authorizeReport = async () => {
    const response = await fetch(
      `/api/installation-reports/${props.reportId}/authorize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorizedByName,
        }),
      },
    );

    const payload = (await response.json()) as {
      error?: string;
      authorizationCompletedAt?: string;
      certificateUrl?: string | null;
    };

    if (!response.ok || !payload.authorizationCompletedAt) {
      throw new Error(
        payload.error ?? "Unable to authorize the installation report.",
      );
    }

    setSuccess({
      certificateUrl: payload.certificateUrl ?? null,
      authorizedAtLabel: new Date(
        payload.authorizationCompletedAt,
      ).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!authorizedByName.trim()) {
        throw new Error("Customer name is required to authorize the report.");
      }

      if (!otpRequested) {
        await requestOtp();
        return;
      }

      await verifyOtp();
      await authorizeReport();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to complete authorization.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <NfcPublicShell
        title="Installation Report Authorized"
        description="The installation report has been approved by the customer and warranty activation is complete."
        footer="This approval is stored against the serialized unit and the linked warranty record."
      >
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="text-sm text-emerald-900">
            Authorization completed at {success.authorizedAtLabel}.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <a href={props.pdfUrl} target="_blank" rel="noreferrer">
              <Button className="w-full" variant="outline">
                <FileText className="h-4 w-4" />
                View Installation Report PDF
              </Button>
            </a>
            {success.certificateUrl ? (
              <a href={success.certificateUrl} target="_blank" rel="noreferrer">
                <Button className="w-full">
                  <ShieldCheck className="h-4 w-4" />
                  Download Warranty Certificate
                </Button>
              </a>
            ) : null}
          </div>
        </div>
      </NfcPublicShell>
    );
  }

  return (
    <NfcPublicShell
      title="Authorize Installation Report"
      description="Review the technician-submitted PDF, verify the customer phone with OTP, and authorize the installation so warranty activation can complete."
      footer="Customer authorization is required before the warranty is activated for this serialized unit."
    >
      <Card className="border-slate-200">
        <CardContent className="space-y-3 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">{props.productName}</p>
          <p>
            Model: {props.modelNumber ?? "Not available"} • Asset {props.assetCode}
          </p>
          <p>Serial: {props.unitSerialNumber}</p>
          <p>Installation date: {props.installationDateLabel}</p>
          <p>
            GPS Coordinates:{" "}
            {props.geoLocationLabel ?? "Not captured"}
          </p>
          {props.geoLocationUrl ? (
            <a
              href={props.geoLocationUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-700 underline"
            >
              Open installation location in Maps
            </a>
          ) : null}
          <p>Submitted: {props.submittedAtLabel}</p>
          <div className="flex flex-col gap-3 pt-2">
            <a href={props.pdfUrl} target="_blank" rel="noreferrer">
              <Button className="w-full" variant="outline">
                <FileText className="h-4 w-4" />
                Review Installation Report PDF
              </Button>
            </a>
            <a href={props.authorizationUrl} target="_blank" rel="noreferrer">
              <Button className="w-full" variant="ghost">
                Open Direct Authorization Link
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Customer name
          </label>
          <Input
            required
            value={authorizedByName}
            onChange={(event) => setAuthorizedByName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Customer phone
          </label>
          <Input value={props.customerPhone} readOnly />
        </div>

        {otpRequested ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              OTP code
            </label>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              placeholder="Enter 6-digit OTP"
            />
          </div>
        ) : null}

        {otpMessage ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {otpMessage}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <Button className="w-full" disabled={loading} type="submit">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : otpRequested ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {otpRequested ? "Verify OTP And Authorize" : "Send OTP To Customer"}
        </Button>
      </form>
    </NfcPublicShell>
  );
}

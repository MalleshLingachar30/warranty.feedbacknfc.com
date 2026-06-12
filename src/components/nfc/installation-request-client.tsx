"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type InstallationRequestClientProps = {
  tagCode: string;
  assetCode: string;
  productName: string;
  modelNumber: string | null;
  serialNumber: string | null;
  saleRegisteredAtLabel: string | null;
};

type SuccessState = {
  jobNumber: string;
  message: string;
};

export function InstallationRequestClient(
  props: InstallationRequestClientProps,
) {
  const [requesterName, setRequesterName] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [siteName, setSiteName] = useState("");
  const [installAddress, setInstallAddress] = useState("");
  const [installCity, setInstallCity] = useState("");
  const [installState, setInstallState] = useState("");
  const [installPincode, setInstallPincode] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/installation-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tagCode: props.tagCode,
          requesterName,
          requesterPhone,
          requesterEmail: requesterEmail || null,
          siteName,
          installAddress,
          installCity,
          installState,
          installPincode,
          preferredDate: preferredDate || null,
          note: note || null,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        successMessage?: string;
        job?: {
          jobNumber: string;
        };
      };

      if (!response.ok || !payload.job) {
        throw new Error(
          payload.error ?? "Unable to send the installation request.",
        );
      }

      setSuccess({
        jobNumber: payload.job.jobNumber,
        message:
          payload.successMessage ??
          "Installation request received successfully.",
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send the installation request.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">{success.message}</p>
        <p>
          Installation job <span className="font-semibold">{success.jobNumber}</span>{" "}
          is now waiting for service-team assignment.
        </p>
        <p>
          Asset <span className="font-semibold">{props.assetCode}</span>{" "}
          {props.serialNumber ? `(${props.serialNumber})` : ""} has been queued
          for installation planning.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <div className="space-y-1">
        <p className="font-medium text-slate-900">{props.productName}</p>
        <p>
          {props.modelNumber ? `${props.modelNumber} • ` : ""}
          Asset {props.assetCode}
        </p>
        <p>Serial: {props.serialNumber ?? "Unassigned"}</p>
        {props.saleRegisteredAtLabel ? (
          <p>Sale registered: {props.saleRegisteredAtLabel}</p>
        ) : null}
      </div>

      <p>
        Site is ready for installation. Send the request below so the service team
        can assign the machine for scheduling.
      </p>

      <form className="space-y-3" onSubmit={onSubmit}>
        <Input
          required
          placeholder="Requester name"
          value={requesterName}
          onChange={(event) => setRequesterName(event.target.value)}
        />
        <Input
          required
          placeholder="Requester phone"
          inputMode="tel"
          value={requesterPhone}
          onChange={(event) => setRequesterPhone(event.target.value)}
        />
        <Input
          placeholder="Requester email (optional)"
          type="email"
          value={requesterEmail}
          onChange={(event) => setRequesterEmail(event.target.value)}
        />
        <Input
          required
          placeholder="Site name / hospital / customer"
          value={siteName}
          onChange={(event) => setSiteName(event.target.value)}
        />
        <Textarea
          required
          placeholder="Installation address"
          value={installAddress}
          onChange={(event) => setInstallAddress(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            required
            placeholder="City"
            value={installCity}
            onChange={(event) => setInstallCity(event.target.value)}
          />
          <Input
            required
            placeholder="State"
            value={installState}
            onChange={(event) => setInstallState(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            required
            placeholder="Pincode"
            value={installPincode}
            onChange={(event) => setInstallPincode(event.target.value)}
          />
          <Input
            type="date"
            placeholder="Preferred installation date"
            value={preferredDate}
            onChange={(event) => setPreferredDate(event.target.value)}
          />
        </div>
        <Textarea
          placeholder="Site-readiness note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <Button className="w-full" disabled={loading} type="submit">
          {loading ? "Sending Request..." : "Request Installation"}
        </Button>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Camera, Loader2, ScanLine } from "lucide-react";

import { type MobileCodeScannerResult } from "@/lib/mobile-code-scanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileCodeScannerDialog } from "@/components/scanning/mobile-code-scanner-dialog";

type BenchScanPayload = {
  state:
    | "ready"
    | "wrong_station"
    | "closed_read_only"
    | "needs_inward"
    | "needs_label"
    | "not_found";
  message: string;
  asset: {
    id: string;
    publicCode: string;
    serialNumber: string | null;
    productModel: {
      name: string;
      modelNumber: string | null;
    };
  } | null;
  controllingTagCode: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
  } | null;
  nextAction: string | null;
  stationLease: string | null;
};

function formatState(value: BenchScanPayload["state"]) {
  return value.replace(/_/g, " ");
}

function formatNextAction(value: string | null) {
  return value ? value.replace(/_/g, " ") : "-";
}

export function InternalServiceBenchScanClient({
  scanUrl,
  orderBaseHref,
  inwardBaseHref,
  defaultReference = null,
}: {
  scanUrl: string;
  orderBaseHref: string;
  inwardBaseHref: string;
  defaultReference?: string | null;
}) {
  const [reference, setReference] = useState(defaultReference ?? "");
  const [isResolving, setIsResolving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BenchScanPayload | null>(null);

  const resolveBenchScan = async (seededReference?: string) => {
    const code = (seededReference ?? reference).trim();

    if (!code) {
      setError("Scan or type the controlling tag, asset code, or serial first.");
      return;
    }

    setIsResolving(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${scanUrl}?code=${encodeURIComponent(code)}`);
      const payload = (await response.json()) as {
        error?: string;
        bench?: BenchScanPayload;
      };

      if (!response.ok || !payload.bench) {
        throw new Error(payload.error ?? "Unable to resolve the bench scan context.");
      }

      setResult(payload.bench);

      if (payload.bench.order) {
        const nextUrl = new URL(
          `${orderBaseHref}/${payload.bench.order.id}`,
          window.location.origin,
        );

        nextUrl.searchParams.set("station", "bench");

        if (payload.bench.stationLease) {
          nextUrl.searchParams.set("stationLease", payload.bench.stationLease);
        }

        if (payload.bench.state === "wrong_station") {
          nextUrl.searchParams.set("scanNotice", "wrong_station");
        }

        if (payload.bench.state === "closed_read_only") {
          nextUrl.searchParams.set("scanNotice", "closed_order");
        }

        window.location.assign(nextUrl.toString());
      }
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Unable to resolve the bench scan context.",
      );
    } finally {
      setIsResolving(false);
    }
  };

  const inwardHref = result?.asset
    ? `${inwardBaseHref}?asset=${encodeURIComponent(
        result.asset.serialNumber ?? result.asset.publicCode,
      )}`
    : inwardBaseHref;

  const handleCameraDetection = async (scanResult: MobileCodeScannerResult) => {
    setReference(scanResult.value);
    await resolveBenchScan(scanResult.value);
  };

  return (
    <>
      <Card>
        <CardHeader>
        <CardTitle className="text-base">Bench Scan</CardTitle>
        <CardDescription>
          Scan the controlling internal-service sticker to open the live depot order in engineer bench context.
        </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Primary path: tap <span className="font-medium text-slate-900">Scan with camera</span> and point the phone at the controlling QR or Data Matrix label. Manual entry remains available if the label is damaged or camera access is unavailable.
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={isResolving}
              className="sm:w-auto"
            >
              <Camera className="size-4" />
              Scan with camera
            </Button>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Type TAG-..., AST-..., serial, or pasted scan value"
              disabled={isResolving}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void resolveBenchScan()}
              disabled={isResolving}
            >
              {isResolving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanLine className="size-4" />
              )}
              Resolve typed code
            </Button>
          </div>

          {error ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">State: {formatState(result.state)}</Badge>
                <Badge variant="outline">Next: {formatNextAction(result.nextAction)}</Badge>
                {result.controllingTagCode ? (
                  <Badge variant="outline">{result.controllingTagCode}</Badge>
                ) : null}
              </div>

              {result.asset ? (
                <div className="mt-3 space-y-1">
                  <p className="font-medium text-slate-900">
                    {result.asset.productModel.name}
                    {result.asset.productModel.modelNumber
                      ? ` · ${result.asset.productModel.modelNumber}`
                      : ""}
                  </p>
                  <p>
                    Asset: {result.asset.publicCode}
                    {result.asset.serialNumber
                      ? ` · Serial: ${result.asset.serialNumber}`
                      : ""}
                  </p>
                </div>
              ) : null}

              <p className="mt-3">{result.message}</p>

              {result.order ? (
                <p className="mt-2 text-xs text-slate-500">
                  Redirecting to {result.order.orderNumber}...
                </p>
              ) : (
                <a
                  href={inwardHref}
                  className="mt-3 inline-flex text-sm font-medium text-indigo-700 underline underline-offset-2"
                >
                  Open inward receipt for this unit
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
              Scan a sticker-led internal-service unit here to jump directly into the live bench workflow.
            </div>
          )}
        </CardContent>
      </Card>

      <MobileCodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleCameraDetection}
        initialManualValue={reference}
        title="Bench Scan with camera"
        description="Use the phone camera to read the controlling internal-service QR or Data Matrix label and open the live depot order in bench context."
        manualLabel="If the label cannot be decoded from the camera, type or paste the scanned value and continue with the same bench resolution flow."
      />
    </>
  );
}

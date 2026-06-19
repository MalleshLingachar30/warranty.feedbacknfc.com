"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, TriangleAlert } from "lucide-react";

import {
  createManualScanResult,
  createNativeBarcodeDetector,
  MOBILE_CODE_SCANNER_FORMATS,
  type MobileCodeScannerFormat,
  type MobileCodeScannerResult,
  normalizeScannedValue,
  zxingFormatsForScanner,
} from "@/lib/mobile-code-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ZxingReaderModule = typeof import("zxing-wasm/reader");

const DEFAULT_FORMATS = [...MOBILE_CODE_SCANNER_FORMATS];
const SCAN_INTERVAL_MS = 300;
const DETECTION_CLOSE_DELAY_MS = 30;

let zxingReaderModulePromise: Promise<ZxingReaderModule> | null = null;

async function getZxingReaderModule() {
  if (!zxingReaderModulePromise) {
    zxingReaderModulePromise = import("zxing-wasm/reader").then(async (module) => {
      await module.prepareZXingModule({ fireImmediately: true });
      return module;
    });
  }

  return zxingReaderModulePromise;
}

function formatEngineLabel(value: "native_barcode_detector" | "zxing_wasm" | null) {
  if (value === "native_barcode_detector") {
    return "Native browser decoder";
  }

  if (value === "zxing_wasm") {
    return "WASM fallback decoder";
  }

  return "Preparing scanner";
}

type MobileCodeScannerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (result: MobileCodeScannerResult) => void | Promise<void>;
  title?: string;
  description?: string;
  formats?: readonly MobileCodeScannerFormat[];
  initialManualValue?: string | null;
  manualLabel?: string;
};

export function MobileCodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = "Scan with camera",
  description = "Open the phone camera and scan a QR or Data Matrix label without an external barcode reader.",
  formats = DEFAULT_FORMATS,
  initialManualValue = null,
  manualLabel = "If camera access fails, type or paste the label value manually.",
}: MobileCodeScannerDialogProps) {
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "detected" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState(initialManualValue ?? "");
  const [engine, setEngine] = useState<"native_barcode_detector" | "zxing_wasm" | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);
  const scanningEnabledRef = useRef(false);
  const scanFrameRef = useRef<null | (() => Promise<void>)>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof createNativeBarcodeDetector>> | null>(
    null,
  );
  const pendingDetectionRef = useRef<MobileCodeScannerResult | null>(null);
  const formatListRef = useRef([...formats]);
  const titleId = useId();

  useEffect(() => {
    formatListRef.current = [...formats];
  }, [formats]);

  const clearScanTimer = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    clearScanTimer();
    scanningEnabledRef.current = false;
    detectorRef.current = null;
    scanInFlightRef.current = false;

    const stream = streamRef.current;
    streamRef.current = null;

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, [clearScanTimer]);

  const finalizeDetection = useCallback((result: MobileCodeScannerResult) => {
    setStatus("detected");
    setError(null);
    stopStream();
    pendingDetectionRef.current = result;
    onOpenChange(false);
  }, [onOpenChange, stopStream]);

  const scheduleNextScan = useCallback((delay = SCAN_INTERVAL_MS) => {
    clearScanTimer();

    if (!scanningEnabledRef.current) {
      return;
    }

    scanTimerRef.current = window.setTimeout(() => {
      void scanFrameRef.current?.();
    }, delay);
  }, [clearScanTimer]);

  const decodeWithZxing = useCallback(async () => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;

    if (!videoElement || !canvasElement || videoElement.videoWidth < 1 || videoElement.videoHeight < 1) {
      return null;
    }

    const context = canvasElement.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error("Unable to create an image context for camera scanning.");
    }

    if (
      canvasElement.width !== videoElement.videoWidth ||
      canvasElement.height !== videoElement.videoHeight
    ) {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
    }

    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    const imageData = context.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const zxingModule = await getZxingReaderModule();
    const results = await zxingModule.readBarcodes(imageData, {
      formats: zxingFormatsForScanner(formatListRef.current),
      maxNumberOfSymbols: 1,
      tryHarder: true,
    });
    const firstResult = results[0];

    if (!firstResult?.text) {
      return null;
    }

    const normalizedValue = normalizeScannedValue(firstResult.text);

    if (!normalizedValue) {
      return null;
    }

    return {
      value: normalizedValue,
      rawValue: firstResult.text,
      format: firstResult.format ?? null,
      source: "zxing_wasm" as const,
    };
  }, []);

  const scanFrame = useCallback(async () => {
    if (!scanningEnabledRef.current || scanInFlightRef.current) {
      return;
    }

    const videoElement = videoRef.current;

    if (!videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      scheduleNextScan(150);
      return;
    }

    scanInFlightRef.current = true;

    try {
      if (engine === "native_barcode_detector" && detectorRef.current) {
        const nativeResults = await detectorRef.current.detect(videoElement);
        const nativeMatch = nativeResults.find((result) => normalizeScannedValue(result.rawValue ?? ""));

        if (nativeMatch?.rawValue) {
          await finalizeDetection({
            value: normalizeScannedValue(nativeMatch.rawValue) ?? nativeMatch.rawValue,
            rawValue: nativeMatch.rawValue,
            format: nativeMatch.format ?? null,
            source: "native_barcode_detector",
          });
          return;
        }
      }

      if (engine === "zxing_wasm") {
        const zxingResult = await decodeWithZxing();

        if (zxingResult) {
          await finalizeDetection(zxingResult);
          return;
        }
      }
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Unable to decode a camera frame with the current scanner.",
      );
      setStatus("error");
    } finally {
      scanInFlightRef.current = false;

      if (scanningEnabledRef.current) {
        scheduleNextScan();
      }
    }
  }, [decodeWithZxing, engine, finalizeDetection, scheduleNextScan]);

  useEffect(() => {
    scanFrameRef.current = scanFrame;
  }, [scanFrame]);

  useEffect(() => {
    if (open) {
      return;
    }

    const pendingDetection = pendingDetectionRef.current;

    if (!pendingDetection) {
      return;
    }

    pendingDetectionRef.current = null;

    const detectionTimer = window.setTimeout(() => {
      void onDetected(pendingDetection);
    }, DETECTION_CLOSE_DELAY_MS);

    return () => {
      window.clearTimeout(detectionTimer);
    };
  }, [onDetected, open]);

  useEffect(() => {
    if (!open) {
      stopStream();
      setStatus("idle");
      setError(null);
      setPermissionGranted(false);
      return;
    }

    let cancelled = false;

    async function startCameraSession() {
      setStatus("starting");
      setError(null);
      setPermissionGranted(false);

      try {
        if (
          typeof navigator === "undefined" ||
          !navigator.mediaDevices ||
          typeof navigator.mediaDevices.getUserMedia !== "function"
        ) {
          throw new Error("This browser does not support in-app camera scanning.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        streamRef.current = stream;
        setPermissionGranted(true);

        const preferredDetector = await createNativeBarcodeDetector(formatListRef.current);

        detectorRef.current = preferredDetector;
        setEngine(preferredDetector ? "native_barcode_detector" : "zxing_wasm");

        if (!preferredDetector) {
          await getZxingReaderModule();
        }

        const videoElement = videoRef.current;

        if (!videoElement) {
          throw new Error("The scanner view could not attach to the camera stream.");
        }

        videoElement.srcObject = stream;
        videoElement.setAttribute("playsinline", "true");
        videoElement.muted = true;
        await videoElement.play();

        if (cancelled) {
          return;
        }

        scanningEnabledRef.current = true;
        setStatus("scanning");
        scheduleNextScan(100);
      } catch (startError) {
        stopStream();
        setStatus("error");
        setEngine(null);
        setError(
          startError instanceof Error
            ? startError.message
            : "Unable to start the camera scanner on this device.",
        );
      }
    }

    void startCameraSession();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, scheduleNextScan, sessionVersion, stopStream]);

  const submitManualValue = async () => {
    const manualResult = createManualScanResult(manualValue);

    if (!manualResult) {
      setError("Type or paste a valid label value first.");
      return;
    }

    finalizeDetection(manualResult);
  };

  const retryCamera = () => {
    stopStream();
    setStatus("idle");
    setError(null);
    setEngine(null);
    setPermissionGranted(false);
    setSessionVersion((current) => current + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        showCloseButton={false}
        className="h-[min(92vh,54rem)] max-w-[min(100vw-1rem,64rem)] overflow-hidden p-0 sm:h-[min(88vh,56rem)]"
        aria-describedby={titleId}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b border-slate-200 px-4 py-4 sm:px-6">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription id={titleId}>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
            <div className="relative flex min-h-[18rem] items-center justify-center bg-slate-950">
              <video
                ref={videoRef}
                className="h-full min-h-[18rem] w-full object-cover"
                autoPlay
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-6 rounded-3xl border-2 border-white/50 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
                <div className="absolute inset-x-10 top-10 rounded-full bg-white/15 px-4 py-2 text-center text-xs font-medium tracking-wide text-white backdrop-blur">
                  Align the QR or Data Matrix label inside the guide
                </div>
              </div>

              {status === "starting" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                  <div className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur">
                    <Loader2 className="size-4 animate-spin" />
                    Preparing camera
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-col border-t border-slate-200 bg-white lg:border-t-0 lg:border-l">
              <div className="space-y-4 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    <Camera className="mr-1 size-3.5" />
                    {permissionGranted ? "Camera ready" : "Waiting for permission"}
                  </Badge>
                  <Badge variant="outline">
                    <ScanLine className="mr-1 size-3.5" />
                    {formatEngineLabel(engine)}
                  </Badge>
                  <Badge variant="outline">QR + Data Matrix</Badge>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {status === "scanning"
                    ? "Point the label at the camera. The scanner will stop as soon as it decodes a valid value."
                    : status === "error"
                      ? "Camera scan is unavailable right now. You can retry or use manual entry below."
                      : "The scanner uses the browser decoder when available and falls back automatically when it is not."}
                </div>

                {error ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900" htmlFor="manual-scan-value">
                    Manual fallback
                  </label>
                  <p className="text-sm text-slate-500">{manualLabel}</p>
                  <Input
                    id="manual-scan-value"
                    value={manualValue}
                    onChange={(event) => setManualValue(event.target.value)}
                    placeholder="TAG-..., AST-..., serial, or full /r/... URL"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </div>

              <DialogFooter className="mt-auto border-t border-slate-200 px-4 py-4 sm:px-6">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button variant="outline" onClick={retryCamera}>
                  Retry camera
                </Button>
                <Button onClick={() => void submitManualValue()}>Use typed code</Button>
              </DialogFooter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

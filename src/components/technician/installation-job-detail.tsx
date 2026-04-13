"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";

import type { TechnicianInstallationJob } from "@/components/technician/types";
import {
  formatDateTime,
  installationStatusBadgeClass,
  workflowLabel,
} from "@/components/technician/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadPhotoFiles } from "@/lib/photo-upload";

interface InstallationJobDetailProps {
  job: TechnicianInstallationJob;
  technicianName?: string;
  onUpdated: (jobId: string) => Promise<void> | void;
}

type GeoLocationState = {
  latitude: number;
  longitude: number;
  accuracy: number;
} | null;

type InstallationPartUsageDraft = {
  id: string;
  assetCode: string;
  tagCode: string;
  quantity: string;
  usageType: "installed" | "consumed" | "returned_unused" | "removed";
  note: string;
};

function makeRecord(labels: string[]) {
  return Object.fromEntries(labels.map((label) => [label, ""])) as Record<
    string,
    string
  >;
}

function createUsageDraft(): InstallationPartUsageDraft {
  return {
    id: crypto.randomUUID(),
    assetCode: "",
    tagCode: "",
    quantity: "1",
    usageType: "installed",
    note: "",
  };
}

function parseRequiredKitCodes(
  includedKitDefinition: Record<string, unknown>,
): string[] {
  const values = new Set<string>();
  const addValue = (candidate: unknown) => {
    if (typeof candidate !== "string") {
      return;
    }

    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      values.add(trimmed);
    }
  };

  const addFromArray = (candidate: unknown) => {
    if (!Array.isArray(candidate)) {
      return;
    }

    for (const entry of candidate) {
      if (typeof entry === "string") {
        addValue(entry);
        continue;
      }

      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const row = entry as Record<string, unknown>;
        addValue(row.kitCode);
        addValue(row.assetCode);
        addValue(row.code);
        addValue(row.partCode);
      }
    }
  };

  addValue(includedKitDefinition.kitCode);
  addFromArray(includedKitDefinition.requiredKitCodes);
  addFromArray(includedKitDefinition.kits);
  addFromArray(includedKitDefinition.parts);

  return [...values];
}

export function InstallationJobDetail({
  job,
  technicianName,
  onUpdated,
}: InstallationJobDetailProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [installAddress, setInstallAddress] = useState("");
  const [installCity, setInstallCity] = useState("");
  const [installState, setInstallState] = useState("");
  const [installPincode, setInstallPincode] = useState("");
  const [installationDate, setInstallationDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [installerName, setInstallerName] = useState("");
  const [unitSerialNumber, setUnitSerialNumber] = useState("");
  const [acknowledgedBy, setAcknowledgedBy] = useState("");
  const [acknowledgementNote, setAcknowledgementNote] = useState("");
  const [customerAccepted, setCustomerAccepted] = useState(false);
  const [beforePhotos, setBeforePhotos] = useState<File[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);
  const [geoLocation, setGeoLocation] = useState<GeoLocationState>(null);
  const [checklistResponses, setChecklistResponses] = useState<
    Record<string, string>
  >({});
  const [commissioningData, setCommissioningData] = useState<
    Record<string, string>
  >({});
  const [partUsages, setPartUsages] = useState<InstallationPartUsageDraft[]>([]);

  const requiredKitCodes = parseRequiredKitCodes(
    job.productModel.includedKitDefinition,
  );

  useEffect(() => {
    setCustomerName(job.installationReport?.customerName ?? "");
    setCustomerPhone("");
    setCustomerEmail("");
    setInstallAddress("");
    setInstallCity("");
    setInstallState("");
    setInstallPincode("");
    setInstallationDate(new Date().toISOString().slice(0, 10));
    setInstallerName(technicianName ?? "");
    setUnitSerialNumber(job.asset.serialNumber ?? "");
    setAcknowledgedBy("");
    setAcknowledgementNote("");
    setCustomerAccepted(false);
    setBeforePhotos([]);
    setAfterPhotos([]);
    setGeoLocation(null);
    setChecklistResponses(makeRecord(job.checklistTemplateSnapshot));
    setCommissioningData(makeRecord(job.commissioningTemplateSnapshot));
    setPartUsages(
      job.partUsages.length > 0
        ? job.partUsages.map((usage) => ({
            id: usage.id,
            assetCode: usage.usedAssetCode,
            tagCode: usage.usedTagCode ?? "",
            quantity: String(usage.quantity),
            usageType: usage.usageType,
            note: "",
          }))
        : [],
    );
    setActionError(null);
    setActionSuccess(null);
  }, [job, technicianName]);

  const updatePartUsage = (
    usageId: string,
    next: Partial<InstallationPartUsageDraft>,
  ) => {
    setPartUsages((previous) =>
      previous.map((usage) =>
        usage.id === usageId ? { ...usage, ...next } : usage,
      ),
    );
  };

  const updateStatus = async (
    status: "technician_enroute" | "on_site" | "commissioning",
    successMessage: string,
  ) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(`/api/installation-jobs/${job.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update installation job.");
      }

      setActionSuccess(successMessage);
      await onUpdated(job.id);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update installation job.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const captureLocation = async () => {
    if (!("geolocation" in navigator)) {
      setActionError("Geolocation is not available on this device.");
      return;
    }

    setActionError(null);

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          resolve();
        },
        (error) => {
          setActionError(error.message || "Unable to capture location.");
          resolve();
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        },
      );
    });
  };

  const submitReport = async () => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      if (!customerName.trim() || !customerPhone.trim()) {
        throw new Error("Customer name and phone are required.");
      }

      if (
        !installAddress.trim() ||
        !installCity.trim() ||
        !installState.trim() ||
        !installPincode.trim()
      ) {
        throw new Error("Complete installation address is required.");
      }

      if (!installerName.trim() || !unitSerialNumber.trim()) {
        throw new Error("Installer name and unit serial number are required.");
      }

      if (
        job.productModel.customerAcknowledgementRequired &&
        (!customerAccepted || !acknowledgedBy.trim())
      ) {
        throw new Error("Customer acknowledgement is required.");
      }

      if (job.productModel.requiredGeoCapture && !geoLocation) {
        throw new Error("Capture geo location before submitting the report.");
      }

      const normalizedPartUsages = partUsages
        .map((usage) => {
          const quantity = Number.parseFloat(usage.quantity || "1");
          return {
            assetCode: usage.assetCode.trim(),
            tagCode: usage.tagCode.trim() || null,
            quantity:
              Number.isFinite(quantity) && quantity > 0
                ? Number(quantity.toFixed(3))
                : 1,
            usageType: usage.usageType,
            note: usage.note.trim() || null,
          };
        })
        .filter((usage) => usage.assetCode.length > 0 || Boolean(usage.tagCode));

      if (
        job.productModel.partTraceabilityMode !== "none" &&
        normalizedPartUsages.length === 0
      ) {
        throw new Error(
          "This model requires traced spare/kit usage before report submission.",
        );
      }

      const [beforePhotoUrls, afterPhotoUrls] = await Promise.all([
        uploadPhotoFiles(beforePhotos),
        uploadPhotoFiles(afterPhotos),
      ]);

      const response = await fetch(`/api/installation-jobs/${job.id}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail: customerEmail || null,
          installAddress,
          installCity,
          installState,
          installPincode,
          installationDate,
          installerName,
          unitSerialNumber,
          geoLocation,
          customerAcknowledgementType: "digital_acceptance",
          customerAcknowledgementPayload: {
            accepted: customerAccepted,
            acknowledgedBy,
            note: acknowledgementNote,
            capturedAt: new Date().toISOString(),
          },
          beforePhotoUrls,
          afterPhotoUrls,
          checklistResponses,
          commissioningData,
          partUsages: normalizedPartUsages,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit installation report.");
      }

      setActionSuccess(
        "Installation report submitted. Warranty activation has been triggered.",
      );
      await onUpdated(job.id);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to submit installation report.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-3 pb-28">
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{job.jobNumber}</CardTitle>
              <CardDescription>
                {job.productModel.name} • {job.asset.code}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={installationStatusBadgeClass(job.status)}
            >
              {workflowLabel(job.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>Manufacturer: {job.manufacturerName}</p>
          <p>Service Center: {job.assignedServiceCenterName || "-"}</p>
          <p>Serial: {job.asset.serialNumber || "Unassigned"}</p>
          <p>Scheduled: {formatDateTime(job.scheduledFor)}</p>
          <p>Lifecycle: {workflowLabel(job.asset.lifecycleState)}</p>
          {job.installationReport ? (
            <p>
              Report submitted {formatDateTime(job.installationReport.submittedAt)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {job.status === "commissioning" ? (
        <>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Customer And Site</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Customer name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
              <Input
                placeholder="Customer phone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
              <Input
                placeholder="Customer email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
              />
              <Textarea
                placeholder="Installation address"
                value={installAddress}
                onChange={(event) => setInstallAddress(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={installCity}
                  onChange={(event) => setInstallCity(event.target.value)}
                />
                <Input
                  placeholder="State"
                  value={installState}
                  onChange={(event) => setInstallState(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Pincode"
                  value={installPincode}
                  onChange={(event) => setInstallPincode(event.target.value)}
                />
                <Input
                  type="date"
                  value={installationDate}
                  onChange={(event) => setInstallationDate(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Installer name"
                  value={installerName}
                  onChange={(event) => setInstallerName(event.target.value)}
                />
                <Input
                  placeholder="Unit serial number"
                  value={unitSerialNumber}
                  onChange={(event) => setUnitSerialNumber(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.checklistTemplateSnapshot.length === 0 ? (
                <p className="text-sm text-slate-500">No checklist items.</p>
              ) : (
                job.checklistTemplateSnapshot.map((item) => (
                  <div key={item} className="space-y-1">
                    <label className="text-sm font-medium text-slate-800">
                      {item}
                    </label>
                    <Input
                      value={checklistResponses[item] ?? ""}
                      onChange={(event) =>
                        setChecklistResponses((current) => ({
                          ...current,
                          [item]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Commissioning</CardTitle>
              <CardDescription>
                Proof capture is mandatory before activation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.commissioningTemplateSnapshot.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No commissioning fields configured.
                </p>
              ) : (
                job.commissioningTemplateSnapshot.map((item) => (
                  <div key={item} className="space-y-1">
                    <label className="text-sm font-medium text-slate-800">
                      {item}
                    </label>
                    <Input
                      value={commissioningData[item] ?? ""}
                      onChange={(event) =>
                        setCommissioningData((current) => ({
                          ...current,
                          [item]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))
              )}

              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Part Traceability
                    </p>
                    <p className="text-xs text-slate-600">
                      Mode: {job.productModel.partTraceabilityMode} • Small parts:{" "}
                      {job.productModel.smallPartTrackingMode}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() =>
                      setPartUsages((current) => [...current, createUsageDraft()])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add Linked Part
                  </Button>
                </div>

                {requiredKitCodes.length > 0 ? (
                  <p className="text-xs text-slate-700">
                    Required kit scans: {requiredKitCodes.join(", ")}
                  </p>
                ) : null}

                {partUsages.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No linked parts added yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {partUsages.map((usage) => (
                      <div
                        key={usage.id}
                        className="space-y-2 rounded-md border border-slate-200 bg-white p-2"
                      >
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Part/kit/pack asset code"
                            value={usage.assetCode}
                            onChange={(event) =>
                              updatePartUsage(usage.id, {
                                assetCode: event.target.value,
                              })
                            }
                          />
                          <Input
                            placeholder="Tag code (for unit scans)"
                            value={usage.tagCode}
                            onChange={(event) =>
                              updatePartUsage(usage.id, {
                                tagCode: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_40px]">
                          <select
                            value={usage.usageType}
                            className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
                            onChange={(event) =>
                              updatePartUsage(usage.id, {
                                usageType: event.target
                                  .value as InstallationPartUsageDraft["usageType"],
                              })
                            }
                          >
                            <option value="installed">Installed</option>
                            <option value="consumed">Consumed</option>
                            <option value="returned_unused">Returned Unused</option>
                            <option value="removed">Removed</option>
                          </select>
                          <Input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={usage.quantity}
                            onChange={(event) =>
                              updatePartUsage(usage.id, {
                                quantity: event.target.value,
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() =>
                              setPartUsages((current) =>
                                current.filter((row) => row.id !== usage.id),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input
                          placeholder="Optional note"
                          value={usage.note}
                          onChange={(event) =>
                            updatePartUsage(usage.id, { note: event.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  Before photos
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(event) =>
                    setBeforePhotos(Array.from(event.target.files ?? []))
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  After photos
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(event) =>
                    setAfterPhotos(Array.from(event.target.files ?? []))
                  }
                />
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Photo policy: minimum{" "}
                {job.productModel.requiredPhotoPolicy.minimumPhotoCount} total
                photo(s), before required:{" "}
                {job.productModel.requiredPhotoPolicy.requireBeforePhoto
                  ? "yes"
                  : "no"}
                , after required:{" "}
                {job.productModel.requiredPhotoPolicy.requireAfterPhoto
                  ? "yes"
                  : "no"}
                .
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Customer Acknowledgement And Geo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={customerAccepted}
                  onChange={(event) => setCustomerAccepted(event.target.checked)}
                />
                Customer confirmed installation completion
              </label>
              <Input
                placeholder="Acknowledged by"
                value={acknowledgedBy}
                onChange={(event) => setAcknowledgedBy(event.target.value)}
              />
              <Textarea
                placeholder="Acknowledgement note"
                value={acknowledgementNote}
                onChange={(event) => setAcknowledgementNote(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void captureLocation()}
              >
                <MapPin className="h-4 w-4" />
                {geoLocation ? "Refresh Geo Capture" : "Capture Geo Location"}
              </Button>
              {geoLocation ? (
                <p className="text-xs text-slate-600">
                  {geoLocation.latitude.toFixed(5)},{" "}
                  {geoLocation.longitude.toFixed(5)} • accuracy{" "}
                  {Math.round(geoLocation.accuracy)}m
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {actionError ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{actionError}</p>
        </div>
      ) : null}

      {actionSuccess ? (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{actionSuccess}</p>
        </div>
      ) : null}

      <div className="sticky bottom-0 border-t border-slate-200 bg-white p-3">
        {job.status === "assigned" || job.status === "scheduled" ? (
          <Button
            className="h-12 w-full"
            disabled={actionLoading}
            onClick={() =>
              void updateStatus(
                "technician_enroute",
                "Navigation started for this installation job.",
              )
            }
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            Start Travel
          </Button>
        ) : null}

        {job.status === "technician_enroute" ? (
          <Button
            className="h-12 w-full"
            disabled={actionLoading}
            onClick={() =>
              void updateStatus("on_site", "Marked as on-site.")
            }
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            Mark On Site
          </Button>
        ) : null}

        {job.status === "on_site" ? (
          <Button
            className="h-12 w-full"
            disabled={actionLoading}
            onClick={() =>
              void updateStatus("commissioning", "Commissioning started.")
            }
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            Start Commissioning
          </Button>
        ) : null}

        {job.status === "commissioning" ? (
          <Button
            className="h-12 w-full"
            disabled={actionLoading}
            onClick={() => void submitReport()}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Submit Installation Report
          </Button>
        ) : null}

        {job.status === "completed" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Installation completed at {formatDateTime(job.technicianCompletedAt)}
            . Activation triggered {formatDateTime(job.activationTriggeredAt)}.
          </div>
        ) : null}
      </div>
    </div>
  );
}

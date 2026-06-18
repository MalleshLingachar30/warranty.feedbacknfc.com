"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TechnicianOption = {
  id: string;
  name: string;
};

type DispatchItemView = {
  id: string;
  partName: string;
  partNumber: string | null;
  quantity: number;
  unitCost: number | null;
  status: string;
  spareAssetCode: string | null;
  spareTagCode: string | null;
};

type DispatchView = {
  id: string;
  dispatchNumber: string;
  status: string;
  notes: string | null;
  assignedTechnicianName: string | null;
  plannedAt: string;
  dispatchedAt: string | null;
  receivedByTechnicianAt: string | null;
  items: DispatchItemView[];
};

type ReturnView = {
  id: string;
  returnNumber: string;
  status: string;
  partName: string;
  partNumber: string | null;
  quantity: number;
  collectionNotes: string | null;
  technicianName: string | null;
  collectedAt: string | null;
  receivedAtServiceCenterAt: string | null;
  receivedByManufacturerAt: string | null;
};

type DraftDispatchItem = {
  id: string;
  partName: string;
  partNumber: string;
  assetCode: string;
  tagCode: string;
  quantity: string;
  unitCost: string;
  notes: string;
};

interface TicketLogisticsClientProps {
  ticketId: string;
  ticketStatus: string;
  currentAssignedTechnicianId: string | null;
  technicians: TechnicianOption[];
  partDispatches: DispatchView[];
  partReturns: ReturnView[];
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createDraftItem(): DraftDispatchItem {
  return {
    id: crypto.randomUUID(),
    partName: "",
    partNumber: "",
    assetCode: "",
    tagCode: "",
    quantity: "1",
    unitCost: "0",
    notes: "",
  };
}

export function TicketLogisticsClient({
  ticketId,
  ticketStatus,
  currentAssignedTechnicianId,
  technicians,
  partDispatches,
  partReturns,
}: TicketLogisticsClientProps) {
  const router = useRouter();
  const [selectedTechnicianId, setSelectedTechnicianId] = useState(
    currentAssignedTechnicianId ?? "",
  );
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftDispatchItem[]>([
    createDraftItem(),
  ]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const postJson = async (
    url: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setLoading(url);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Request failed.");
      }

      setSuccess(successMessage);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed.",
      );
    } finally {
      setLoading(null);
    }
  };

  const createDispatch = async () => {
    const filteredItems = draftItems
      .map((item) => ({
        partName: item.partName,
        partNumber: item.partNumber,
        assetCode: item.assetCode,
        tagCode: item.tagCode,
        quantity: item.quantity,
        unitCost: item.unitCost,
        notes: item.notes,
      }))
      .filter((item) => item.assetCode.trim() || item.tagCode.trim());

    if (filteredItems.length === 0) {
      setError("Add at least one spare asset or tag code before creating a dispatch.");
      setSuccess(null);
      return;
    }

    await postJson(
      `/api/service-center/tickets/${ticketId}/part-dispatches`,
      {
        assignedTechnicianId: selectedTechnicianId || null,
        notes: dispatchNotes,
        items: filteredItems,
      },
      "Spare dispatch created successfully.",
    );
  };

  const dispatchAction = async (
    dispatchId: string,
    action: "mark_dispatched" | "mark_received_by_technician" | "cancel",
  ) => {
    const label =
      action === "mark_dispatched"
        ? "Dispatch marked as shipped."
        : action === "mark_received_by_technician"
          ? "Technician receipt recorded."
          : "Dispatch cancelled.";
    await postJson(
      `/api/service-center/part-dispatches/${dispatchId}/status`,
      { action },
      label,
    );
  };

  const returnAction = async (
    returnId: string,
    action: "receive_service_center" | "cancel",
  ) => {
    const label =
      action === "receive_service_center"
        ? "Return received at service center."
        : "Return cancelled.";

    await postJson(
      `/api/service-center/part-returns/${returnId}/status`,
      { action },
      label,
    );
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Dispatch Traced Spares</CardTitle>
          <CardDescription>
            Prepare a spare issue note for ticket status {statusLabel(ticketStatus)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">
                Technician
              </label>
              <select
                value={selectedTechnicianId}
                onChange={(event) => setSelectedTechnicianId(event.target.value)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Unassigned technician</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">
                Notes
              </label>
              <Textarea
                value={dispatchNotes}
                onChange={(event) => setDispatchNotes(event.target.value)}
                placeholder="Courier note, batch, or issue context"
                className="min-h-10"
              />
            </div>
          </div>

          <div className="space-y-3">
            {draftItems.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-slate-200 bg-slate-50 p-3"
              >
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder="Part name"
                    value={item.partName}
                    onChange={(event) =>
                      setDraftItems((previous) =>
                        previous.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, partName: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Part number"
                    value={item.partNumber}
                    onChange={(event) =>
                      setDraftItems((previous) =>
                        previous.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, partNumber: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Spare asset code"
                    value={item.assetCode}
                    onChange={(event) =>
                      setDraftItems((previous) =>
                        previous.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, assetCode: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Spare tag code"
                    value={item.tagCode}
                    onChange={(event) =>
                      setDraftItems((previous) =>
                        previous.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, tagCode: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Quantity"
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onChange={(event) =>
                      setDraftItems((previous) =>
                        previous.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, quantity: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Unit cost"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={item.unitCost}
                    onChange={(event) =>
                      setDraftItems((previous) =>
                        previous.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, unitCost: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    placeholder="Line note"
                    value={item.notes}
                    onChange={(event) =>
                      setDraftItems((previous) =>
                        previous.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, notes: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      setDraftItems((previous) =>
                        previous.length === 1
                          ? previous
                          : previous.filter((entry) => entry.id !== item.id),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDraftItems((previous) => [...previous, createDraftItem()])
              }
            >
              <Plus className="h-4 w-4" />
              Add line
            </Button>
            <Button
              type="button"
              onClick={() => void createDispatch()}
              disabled={Boolean(loading)}
            >
              {loading === `/api/service-center/tickets/${ticketId}/part-dispatches` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Create Dispatch
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Spare Dispatch History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {partDispatches.length === 0 ? (
            <p className="text-sm text-slate-600">No spare dispatches created yet.</p>
          ) : (
            partDispatches.map((dispatch) => (
              <div
                key={dispatch.id}
                className="rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">
                      {dispatch.dispatchNumber}
                    </p>
                    <p className="text-xs text-slate-500">
                      Planned {formatDateTime(dispatch.plannedAt)} • Technician:{" "}
                      {dispatch.assignedTechnicianName ?? "Not assigned"}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {statusLabel(dispatch.status)}
                  </Badge>
                </div>
                {dispatch.notes ? (
                  <p className="mt-2 text-sm text-slate-600">{dispatch.notes}</p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {dispatch.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-slate-100 bg-slate-50 p-2 text-sm text-slate-700"
                    >
                      <p className="font-medium text-slate-900">
                        {item.partName}
                        {item.partNumber ? ` (${item.partNumber})` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.spareAssetCode ?? "No asset code"}
                        {item.spareTagCode ? ` • ${item.spareTagCode}` : ""}
                        {` • Qty ${item.quantity}`}
                        {item.unitCost !== null ? ` • INR ${item.unitCost}` : ""}
                        {` • ${statusLabel(item.status)}`}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dispatch.status === "planned" ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        void dispatchAction(dispatch.id, "mark_dispatched")
                      }
                      disabled={Boolean(loading)}
                    >
                      Mark Dispatched
                    </Button>
                  ) : null}
                  {(dispatch.status === "planned" || dispatch.status === "dispatched") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void dispatchAction(
                          dispatch.id,
                          "mark_received_by_technician",
                        )
                      }
                      disabled={Boolean(loading)}
                    >
                      Technician Received
                    </Button>
                  ) : null}
                  {(dispatch.status === "planned" || dispatch.status === "dispatched") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-rose-700"
                      onClick={() => void dispatchAction(dispatch.id, "cancel")}
                      disabled={Boolean(loading)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Removed Part Returns</CardTitle>
          <CardDescription>
            These records are created when removed parts are captured directly, and expected return obligations are created automatically from installed replacement spares.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {partReturns.length === 0 ? (
            <p className="text-sm text-slate-600">No old-part return records yet.</p>
          ) : (
            partReturns.map((partReturn) => (
              <div
                key={partReturn.id}
                className="rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">
                      {partReturn.returnNumber}
                    </p>
                    <p className="text-xs text-slate-500">
                      {partReturn.partName}
                      {partReturn.partNumber ? ` (${partReturn.partNumber})` : ""}
                      {` • Qty ${partReturn.quantity}`}
                      {partReturn.technicianName
                        ? ` • Collected by ${partReturn.technicianName}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {statusLabel(partReturn.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Collected: {formatDateTime(partReturn.collectedAt)} • Service-center receipt:{" "}
                  {formatDateTime(partReturn.receivedAtServiceCenterAt)} • Manufacturer receipt:{" "}
                  {formatDateTime(partReturn.receivedByManufacturerAt)}
                </p>
                {partReturn.collectionNotes ? (
                  <p className="mt-2 text-sm text-slate-600">
                    {partReturn.collectionNotes}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    partReturn.status === "collected_by_technician" ||
                    partReturn.status === "awaiting_collection"
                  ) ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        void returnAction(
                          partReturn.id,
                          "receive_service_center",
                        )
                      }
                      disabled={Boolean(loading)}
                    >
                      {partReturn.status === "awaiting_collection"
                        ? "Receive Expected Return"
                        : "Receive at Service Center"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

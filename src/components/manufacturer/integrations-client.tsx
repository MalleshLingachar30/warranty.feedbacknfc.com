"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, RefreshCw, RotateCcw, ServerCog } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type FeedType = "item_master" | "distributor_master" | "serialized_dispatch";
type ConnectorStatus = "active" | "inactive";
type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed";

type ConnectorRecord = {
  id: string;
  connectorType: string;
  name: string;
  status: ConnectorStatus;
  settings: Record<string, unknown>;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type FeedRecord = {
  id: string;
  feedType: FeedType;
  sourceSystem: string;
  displayName: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
  lastSuccessfulRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type IntegrationStats = {
  itemMasterRecords: number;
  distributorMasterRecords: number;
  dispatchRecords: number;
  failedStagingRows: number;
};

type ConnectorPayload = {
  connector: ConnectorRecord;
  feeds: FeedRecord[];
  stats: IntegrationStats;
};

type RunRecord = {
  id: string;
  feedId: string;
  feedType: FeedType;
  feedDisplayName: string;
  sourceSystem: string;
  status: RunStatus;
  totalRowCount: number;
  stagedRowCount: number;
  appliedRowCount: number;
  failedRowCount: number;
  errorSummary: unknown;
  startedAt: string;
  completedAt: string | null;
};

type RunsPayload = {
  runs: RunRecord[];
};

type ItemMasterImportRunSummary = {
  id: string;
  feedType: FeedType;
  status: RunStatus;
  totalRowCount: number;
  stagedRowCount: number;
  appliedRowCount: number;
  failedRowCount: number;
  createdProductModelCount: number;
  errorSummary: Record<string, number>;
};

type DistributorMasterImportRunSummary = {
  id: string;
  feedType: FeedType;
  status: RunStatus;
  totalRowCount: number;
  stagedRowCount: number;
  appliedRowCount: number;
  failedRowCount: number;
  createdOrganizationCount: number;
  errorSummary: Record<string, number>;
};

type SerializedDispatchImportRunSummary = {
  id: string;
  feedType: FeedType;
  status: RunStatus;
  totalRowCount: number;
  stagedRowCount: number;
  appliedRowCount: number;
  failedRowCount: number;
  pendingMatchCount: number;
  errorSummary: Record<string, number>;
};

const itemMasterSamplePayload = JSON.stringify(
  {
    rows: [
      {
        itemCode: "BPL-VENT-9000",
        itemSeriesCode: "VENTILATOR",
        itemDescription: "BPL Ventilator 9000",
        category: "Critical Care",
        subCategory: "Ventilator",
        modelNumber: "VENT-9000",
        isActive: true,
      },
      {
        itemCode: "BPL-MON-510",
        itemSeriesCode: "MONITOR",
        itemDescription: "BPL Patient Monitor 510",
        category: "Monitoring",
        subCategory: "Patient Monitor",
        modelNumber: "MON-510",
        isActive: true,
      },
      {
        itemCode: "BPL-SPARE-FAN-01",
        itemSeriesCode: "SPARES",
        itemDescription: "Cooling Fan Spare",
        category: "Spare",
        subCategory: "Cooling",
        modelNumber: "FAN-01",
        isActive: true,
      },
    ],
  },
  null,
  2,
);

const distributorMasterSamplePayload = JSON.stringify(
  {
    rows: [
      {
        distributorCode: "DIST-BLR-001",
        distributorName: "BPL Healthcare Distributors Bengaluru",
        address: "42 Richmond Road",
        city: "Bengaluru",
        state: "Karnataka",
        country: "IN",
        pincode: "560025",
        contactName: "Ramesh Kumar",
        contactEmail: "ramesh.kumar@bpldist.example.com",
        contactPhone: "9876543210",
        isActive: true,
      },
      {
        distributorCode: "DIST-DEL-014",
        distributorName: "North India Critical Care Supplies",
        address: "18 Ring Road",
        city: "New Delhi",
        state: "Delhi",
        country: "IN",
        pincode: "110024",
        contactName: "Neha Gupta",
        contactEmail: "neha.gupta@northcare.example.com",
        contactPhone: "9898989898",
        isActive: true,
      },
    ],
  },
  null,
  2,
);

const serializedDispatchSamplePayload = JSON.stringify(
  {
    rows: [
      {
        sourceDocumentNumber: "INV-2026-00041",
        sourceLineNumber: "10",
        itemCode: "BPL-VENT-9000",
        itemDescription: "BPL Ventilator 9000",
        serialNumber: "VENT-9000-SN-0001",
        distributorCode: "DIST-BLR-001",
        distributorName: "BPL Healthcare Distributors Bengaluru",
        warehouseCode: "WH-BLR-01",
        transactionDate: "2026-06-11",
        quantity: 1,
        sourceSystem: "sap",
      },
      {
        sourceDocumentNumber: "INV-2026-00042",
        sourceLineNumber: "10",
        itemCode: "BPL-MON-510",
        itemDescription: "BPL Patient Monitor 510",
        serialNumber: "MON-510-SN-0001",
        distributorCode: "DIST-DEL-014",
        distributorName: "North India Critical Care Supplies",
        warehouseCode: "WH-DEL-02",
        transactionDate: "2026-06-11",
        quantity: 1,
        sourceSystem: "sap",
      },
    ],
  },
  null,
  2,
);

const feedEndpointByType: Record<FeedType, string> = {
  item_master: "/api/manufacturer/integrations/item-master/import",
  distributor_master: "/api/manufacturer/integrations/distributor-master/import",
  serialized_dispatch: "/api/manufacturer/integrations/serialized-dispatch/import",
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function connectorStatusTone(status: ConnectorStatus) {
  return status === "active" ? "default" : "secondary";
}

function runStatusTone(status: RunStatus) {
  switch (status) {
    case "completed":
      return "default";
    case "completed_with_errors":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function feedCountForType(feedType: FeedType, stats: IntegrationStats) {
  switch (feedType) {
    case "item_master":
      return stats.itemMasterRecords;
    case "distributor_master":
      return stats.distributorMasterRecords;
    case "serialized_dispatch":
      return stats.dispatchRecords;
  }
}

function summarizeRunError(errorSummary: unknown) {
  if (!errorSummary || typeof errorSummary !== "object") {
    return "No error summary";
  }

  const summary = errorSummary as {
    message?: unknown;
    failedRowCount?: unknown;
  };

  if (typeof summary.message === "string" && summary.message.trim()) {
    return summary.message.trim();
  }

  if (typeof summary.failedRowCount === "number" && summary.failedRowCount > 0) {
    return `${summary.failedRowCount} row(s) failed validation`;
  }

  return "No error summary";
}

function getSummaryEntries(summary: Record<string, number>) {
  return Object.entries(summary).filter(([, count]) => Number(count) > 0);
}

export function ManufacturerIntegrationsClient() {
  const [data, setData] = useState<ConnectorPayload | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingTarget, setSavingTarget] = useState<string | null>(null);
  const [isRunningItemMasterImport, setIsRunningItemMasterImport] =
    useState(false);
  const [isRunningDistributorMasterImport, setIsRunningDistributorMasterImport] =
    useState(false);
  const [isRunningSerializedDispatchImport, setIsRunningSerializedDispatchImport] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [itemMasterPayload, setItemMasterPayload] = useState(
    itemMasterSamplePayload,
  );
  const [distributorMasterPayload, setDistributorMasterPayload] = useState(
    distributorMasterSamplePayload,
  );
  const [serializedDispatchPayload, setSerializedDispatchPayload] = useState(
    serializedDispatchSamplePayload,
  );
  const [itemMasterRunSummary, setItemMasterRunSummary] =
    useState<ItemMasterImportRunSummary | null>(null);
  const [distributorMasterRunSummary, setDistributorMasterRunSummary] =
    useState<DistributorMasterImportRunSummary | null>(null);
  const [serializedDispatchRunSummary, setSerializedDispatchRunSummary] =
    useState<SerializedDispatchImportRunSummary | null>(null);

  async function loadData() {
    const [connectorResponse, runsResponse] = await Promise.allSettled([
      fetch("/api/manufacturer/integrations", {
        cache: "no-store",
      }),
      fetch("/api/manufacturer/integrations/runs?limit=12", {
        cache: "no-store",
      }),
    ]);

    if (connectorResponse.status !== "fulfilled") {
      throw new Error("Unable to load connector details.");
    }

    const connectorPayload = (await connectorResponse.value.json()) as
      | ConnectorPayload
      | { error?: string };

    if (!connectorResponse.value.ok) {
      throw new Error(
        "error" in connectorPayload && connectorPayload.error
          ? connectorPayload.error
          : "Unable to load connector details.",
      );
    }

    setData(connectorPayload as ConnectorPayload);

    if (runsResponse.status !== "fulfilled") {
      setRuns([]);
      setErrorMessage(
        "Connector loaded, but recent import runs could not be loaded. Try Refresh.",
      );
      return;
    }

    const runsPayload = (await runsResponse.value.json()) as
      | RunsPayload
      | { error?: string };

    if (!runsResponse.value.ok) {
      setRuns([]);
      setErrorMessage(
        "error" in runsPayload && runsPayload.error
          ? `${runsPayload.error} Recent runs may be temporarily unavailable.`
          : "Connector loaded, but recent import runs could not be loaded. Try Refresh.",
      );
      return;
    }

    setRuns((runsPayload as RunsPayload).runs);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        await loadData();
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load integrations workspace.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshData() {
    setIsRefreshing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await loadData();
      setStatusMessage("Connector data refreshed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to refresh integrations workspace.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function saveConnectorPatch(patch: {
    connector?: Record<string, unknown>;
    feeds?: Record<string, unknown>;
  }) {
    setSavingTarget(
      typeof patch.connector !== "undefined"
        ? "connector"
        : Object.keys(patch.feeds ?? {})[0] ?? "feed",
    );
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/manufacturer/integrations", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update connector settings.");
      }

      await loadData();
      setStatusMessage("Connector settings updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update connector settings.",
      );
    } finally {
      setSavingTarget(null);
    }
  }

  async function runMockItemMasterImport() {
    setIsRunningItemMasterImport(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setItemMasterRunSummary(null);

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(itemMasterPayload);
    } catch {
      setErrorMessage("Mock item master payload must be valid JSON.");
      setIsRunningItemMasterImport(false);
      return;
    }

    try {
      const response = await fetch("/api/manufacturer/integrations/item-master/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedPayload),
      });

      const payload = (await response.json()) as {
        error?: string;
        run?: ItemMasterImportRunSummary;
      };

      if (!response.ok || !payload.run) {
        throw new Error(payload.error ?? "Unable to run mock item master import.");
      }

      setItemMasterRunSummary(payload.run);
      await loadData();
      setStatusMessage("Mock item master import completed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to run mock item master import.",
      );
    } finally {
      setIsRunningItemMasterImport(false);
    }
  }

  async function runMockDistributorMasterImport() {
    setIsRunningDistributorMasterImport(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setDistributorMasterRunSummary(null);

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(distributorMasterPayload);
    } catch {
      setErrorMessage("Mock distributor master payload must be valid JSON.");
      setIsRunningDistributorMasterImport(false);
      return;
    }

    try {
      const response = await fetch(
        "/api/manufacturer/integrations/distributor-master/import",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parsedPayload),
        },
      );

      const payload = (await response.json()) as {
        error?: string;
        run?: DistributorMasterImportRunSummary;
      };

      if (!response.ok || !payload.run) {
        throw new Error(
          payload.error ?? "Unable to run mock distributor master import.",
        );
      }

      setDistributorMasterRunSummary(payload.run);
      await loadData();
      setStatusMessage("Mock distributor master import completed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to run mock distributor master import.",
      );
    } finally {
      setIsRunningDistributorMasterImport(false);
    }
  }

  async function runMockSerializedDispatchImport() {
    setIsRunningSerializedDispatchImport(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setSerializedDispatchRunSummary(null);

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(serializedDispatchPayload);
    } catch {
      setErrorMessage("Mock serialized dispatch payload must be valid JSON.");
      setIsRunningSerializedDispatchImport(false);
      return;
    }

    try {
      const response = await fetch(
        "/api/manufacturer/integrations/serialized-dispatch/import",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parsedPayload),
        },
      );

      const payload = (await response.json()) as {
        error?: string;
        run?: SerializedDispatchImportRunSummary;
      };

      if (!response.ok || !payload.run) {
        throw new Error(
          payload.error ?? "Unable to run mock serialized dispatch import.",
        );
      }

      setSerializedDispatchRunSummary(payload.run);
      await loadData();
      setStatusMessage("Mock serialized dispatch import completed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to run mock serialized dispatch import.",
      );
    } finally {
      setIsRunningSerializedDispatchImport(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Integrations"
          description="Inspect the SAP connector, feed health, and recent import runs."
        />
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading connector workspace...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Integrations"
          description="Inspect the SAP connector, feed health, and recent import runs."
        />
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="py-8 text-sm text-rose-900">
            {errorMessage ?? "Unable to load the integrations workspace."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Inspect the SAP connector, feed health, and recent import runs."
        actions={
          <Button
            variant="outline"
            onClick={() => void refreshData()}
            disabled={isRefreshing || Boolean(savingTarget)}
          >
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="h-5 w-5" />
              {data.connector.name}
            </CardTitle>
            <CardDescription>
              Connector type: {data.connector.connectorType.toUpperCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={connectorStatusTone(data.connector.status)}>
                {data.connector.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Last run: {formatDateTime(data.connector.lastRunAt)}
              </span>
            </div>

            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="font-medium text-slate-900">Connector active</span>
              <input
                type="checkbox"
                checked={data.connector.status === "active"}
                disabled={savingTarget === "connector" || isRefreshing}
                onChange={(event) =>
                  void saveConnectorPatch({
                    connector: {
                      active: event.target.checked,
                    },
                  })
                }
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Created
                </p>
                <p className="mt-1 text-sm font-medium">
                  {formatDateTime(data.connector.createdAt)}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Updated
                </p>
                <p className="mt-1 text-sm font-medium">
                  {formatDateTime(data.connector.updatedAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connector Totals</CardTitle>
            <CardDescription>
              Current record counts from the phase 1 inbound feeds.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Item master records
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {data.stats.itemMasterRecords.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Distributor records
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {data.stats.distributorMasterRecords.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Dispatch records
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {data.stats.dispatchRecords.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Failed staging rows
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {data.stats.failedStagingRows.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {data.feeds.map((feed) => (
          <Card key={feed.id}>
            <CardHeader>
              <CardTitle>{feed.displayName}</CardTitle>
              <CardDescription>
                Source: {feed.sourceSystem.toUpperCase()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Imported records
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {feedCountForType(feed.feedType, data.stats).toLocaleString()}
                </p>
              </div>

              <label className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="font-medium text-slate-900">Feed enabled</span>
                <input
                  type="checkbox"
                  checked={feed.enabled}
                  disabled={savingTarget === feed.feedType || isRefreshing}
                  onChange={(event) =>
                    void saveConnectorPatch({
                      feeds: {
                        [feed.feedType]: {
                          enabled: event.target.checked,
                        },
                      },
                    })
                  }
                />
              </label>

              <div className="text-sm text-muted-foreground">
                Last successful run: {formatDateTime(feed.lastSuccessfulRunAt)}
              </div>

              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Import endpoint: <code>{feedEndpointByType[feed.feedType]}</code>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mock Item Master Import</CardTitle>
          <CardDescription>
            Use a sample SAP-style payload to test the phase 1 item master connector
            before the real customer system is connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setItemMasterPayload(itemMasterSamplePayload);
                setItemMasterRunSummary(null);
                setErrorMessage(null);
                setStatusMessage("Loaded the sample item master payload.");
              }}
              disabled={isRunningItemMasterImport}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Load sample payload
            </Button>
            <Button
              type="button"
              onClick={() => void runMockItemMasterImport()}
              disabled={isRunningItemMasterImport || Boolean(savingTarget)}
            >
              {isRunningItemMasterImport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run mock import
            </Button>
          </div>

          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            This runner uses the live <code>/api/manufacturer/integrations/item-master/import</code>{" "}
            endpoint, so it tests the same normalization, staging, run logging, and
            upsert path the real SAP connector will use later.
          </div>

          <Textarea
            value={itemMasterPayload}
            onChange={(event) => setItemMasterPayload(event.target.value)}
            className="min-h-[260px] font-mono text-xs"
            spellCheck={false}
            disabled={isRunningItemMasterImport}
          />

          {itemMasterRunSummary ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Run status
                </p>
                <div className="mt-2">
                  <Badge variant={runStatusTone(itemMasterRunSummary.status)}>
                    {itemMasterRunSummary.status}
                  </Badge>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {itemMasterRunSummary.totalRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Applied rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {itemMasterRunSummary.appliedRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Failed rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {itemMasterRunSummary.failedRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Product models created
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {itemMasterRunSummary.createdProductModelCount.toLocaleString()}
                </p>
              </div>
            </div>
          ) : null}

          {itemMasterRunSummary &&
          Object.keys(itemMasterRunSummary.errorSummary).length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Error summary:{" "}
              {Object.entries(itemMasterRunSummary.errorSummary)
                .map(([key, count]) => `${key}: ${count}`)
                .join(", ")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mock Distributor Master Import</CardTitle>
          <CardDescription>
            Use a sample SAP-style payload to test distributor onboarding and
            distributor-organization mapping before the real customer system is
            connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDistributorMasterPayload(distributorMasterSamplePayload);
                setDistributorMasterRunSummary(null);
                setErrorMessage(null);
                setStatusMessage("Loaded the sample distributor master payload.");
              }}
              disabled={isRunningDistributorMasterImport}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Load sample payload
            </Button>
            <Button
              type="button"
              onClick={() => void runMockDistributorMasterImport()}
              disabled={isRunningDistributorMasterImport || Boolean(savingTarget)}
            >
              {isRunningDistributorMasterImport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run mock import
            </Button>
          </div>

          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            This runner uses the live{" "}
            <code>/api/manufacturer/integrations/distributor-master/import</code>{" "}
            endpoint, so it tests the same normalization, staging, run logging,
            distributor creation, and organization-mapping path the real SAP
            connector will use later.
          </div>

          <Textarea
            value={distributorMasterPayload}
            onChange={(event) => setDistributorMasterPayload(event.target.value)}
            className="min-h-[240px] font-mono text-xs"
            spellCheck={false}
            disabled={isRunningDistributorMasterImport}
          />

          {distributorMasterRunSummary ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Run status
                </p>
                <div className="mt-2">
                  <Badge variant={runStatusTone(distributorMasterRunSummary.status)}>
                    {distributorMasterRunSummary.status}
                  </Badge>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {distributorMasterRunSummary.totalRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Applied rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {distributorMasterRunSummary.appliedRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Failed rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {distributorMasterRunSummary.failedRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Organizations created
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {distributorMasterRunSummary.createdOrganizationCount.toLocaleString()}
                </p>
              </div>
            </div>
          ) : null}

          {distributorMasterRunSummary &&
          Object.keys(distributorMasterRunSummary.errorSummary).length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Error summary:{" "}
              {Object.entries(distributorMasterRunSummary.errorSummary)
                .map(([key, count]) => `${key}: ${count}`)
                .join(", ")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mock Serialized Dispatch Import</CardTitle>
          <CardDescription>
            Use a sample SAP-style payload to test serialized invoice or dispatch
            ingestion and observe whether rows are applied immediately or remain
            pending until matching serialized assets are available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSerializedDispatchPayload(serializedDispatchSamplePayload);
                setSerializedDispatchRunSummary(null);
                setErrorMessage(null);
                setStatusMessage("Loaded the sample serialized dispatch payload.");
              }}
              disabled={isRunningSerializedDispatchImport}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Load sample payload
            </Button>
            <Button
              type="button"
              onClick={() => void runMockSerializedDispatchImport()}
              disabled={isRunningSerializedDispatchImport || Boolean(savingTarget)}
            >
              {isRunningSerializedDispatchImport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run mock import
            </Button>
          </div>

          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            This runner uses the live{" "}
            <code>/api/manufacturer/integrations/serialized-dispatch/import</code>{" "}
            endpoint, so it tests the same normalization, staging, dispatch-record
            creation, and asset reconciliation path the real SAP connector will use
            later.
          </div>

          <Textarea
            value={serializedDispatchPayload}
            onChange={(event) => setSerializedDispatchPayload(event.target.value)}
            className="min-h-[240px] font-mono text-xs"
            spellCheck={false}
            disabled={isRunningSerializedDispatchImport}
          />

          {serializedDispatchRunSummary ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Run status
                </p>
                <div className="mt-2">
                  <Badge variant={runStatusTone(serializedDispatchRunSummary.status)}>
                    {serializedDispatchRunSummary.status}
                  </Badge>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {serializedDispatchRunSummary.totalRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Applied rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {serializedDispatchRunSummary.appliedRowCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pending matches
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {serializedDispatchRunSummary.pendingMatchCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Failed rows
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {serializedDispatchRunSummary.failedRowCount.toLocaleString()}
                </p>
              </div>
            </div>
          ) : null}

          {serializedDispatchRunSummary ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Rows can complete as <code>pending_match</code> when dispatch data
              arrives before the corresponding factory-side serialized asset exists in
              the platform. That is expected in early connector testing.
            </div>
          ) : null}

          {serializedDispatchRunSummary &&
          getSummaryEntries(serializedDispatchRunSummary.errorSummary).length > 0 ? (
            <div
              className={`rounded-md px-4 py-3 text-sm ${
                getSummaryEntries(serializedDispatchRunSummary.errorSummary).every(
                  ([key]) => key === "pending_match",
                )
                  ? "border border-sky-200 bg-sky-50 text-sky-950"
                  : "border border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {getSummaryEntries(serializedDispatchRunSummary.errorSummary).every(
                ([key]) => key === "pending_match",
              )
                ? "Reconciliation summary: "
                : "Error summary: "}
              {getSummaryEntries(serializedDispatchRunSummary.errorSummary)
                .map(([key, count]) => `${key}: ${count}`)
                .join(", ")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Import Runs</CardTitle>
          <CardDescription>
            Latest execution history across the three SAP inbound feeds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No import runs have been recorded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Error Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {run.feedDisplayName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={runStatusTone(run.status)}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.totalRowCount.toLocaleString()}</TableCell>
                    <TableCell>{run.appliedRowCount.toLocaleString()}</TableCell>
                    <TableCell>{run.failedRowCount.toLocaleString()}</TableCell>
                    <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                    <TableCell>{formatDateTime(run.completedAt)}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-sm text-muted-foreground">
                      {run.status === "completed" || run.status === "running"
                        ? "—"
                        : summarizeRunError(run.errorSummary)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

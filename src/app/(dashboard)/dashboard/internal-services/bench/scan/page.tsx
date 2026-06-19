import { PageHeader } from "@/components/dashboard/page-header";
import { InternalServiceBenchScanClient } from "@/components/internal-services/bench-scan-client";

interface DepotInternalServicesBenchScanPageProps {
  searchParams: Promise<{ code?: string | string[] }>;
}

export default async function DepotInternalServicesBenchScanPage({
  searchParams,
}: DepotInternalServicesBenchScanPageProps) {
  const query = await searchParams;
  const defaultReference =
    typeof query.code === "string"
      ? query.code
      : Array.isArray(query.code)
        ? query.code[0] ?? null
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bench Scan"
        description="Primary engineer entry for sticker-led internal-service units already received into depot workflow."
      />

      <InternalServiceBenchScanClient
        scanUrl="/api/service-center/internal-services/bench/scan"
        orderBaseHref="/dashboard/internal-services/orders"
        inwardBaseHref="/dashboard/internal-services/inward"
        defaultReference={defaultReference}
      />
    </div>
  );
}

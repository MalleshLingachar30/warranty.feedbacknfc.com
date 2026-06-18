import { InternalServicesPlaceholderPage } from "@/components/internal-services/placeholder-page";

export default function DepotInternalServicesAnalyticsPage() {
  return (
    <InternalServicesPlaceholderPage
      title="Internal Services Analytics"
      description="Depot metrics for inward pressure, bench throughput, QA fallout, and release outcomes."
      nextSteps={[
        "Add stage aging buckets for depot-owned internal orders.",
        "Measure engineer throughput and QA rework rates.",
        "Break down stock return, saleable recovery, scrap, and cannibalization outcomes.",
      ]}
    />
  );
}

import { InternalServicesPlaceholderPage } from "@/components/internal-services/placeholder-page";

export default function ManufacturerInternalServicesAnalyticsPage() {
  return (
    <InternalServicesPlaceholderPage
      title="Internal Services Analytics"
      description="Module-specific analytics for inward aging, repair throughput, QA fallout, and recovery outcomes."
      nextSteps={[
        "Track aging by stage: inward, diagnosis, parts wait, QA, and disposition.",
        "Measure recoveries into saleable stock versus scrap and cannibalization.",
        "Break down internal service pressure by depot, product model, and source organization.",
      ]}
    />
  );
}

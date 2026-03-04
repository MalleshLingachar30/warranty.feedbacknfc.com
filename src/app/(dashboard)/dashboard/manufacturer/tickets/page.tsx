import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ManufacturerTicketsPage() {
  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Cross-center service request monitoring is available here in the next iteration."
      />
      <Card>
        <CardHeader>
          <CardTitle>Tickets Workspace</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ticket routing, SLA timelines, and escalations will be surfaced in this page.
        </CardContent>
      </Card>
    </div>
  )
}

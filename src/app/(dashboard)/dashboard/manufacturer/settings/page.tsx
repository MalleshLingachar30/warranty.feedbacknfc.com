import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ManufacturerSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organization configuration and team controls are managed in this section."
      />
      <Card>
        <CardHeader>
          <CardTitle>Settings Workspace</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          SLA rules, notification preferences, and API keys can be added here.
        </CardContent>
      </Card>
    </div>
  )
}

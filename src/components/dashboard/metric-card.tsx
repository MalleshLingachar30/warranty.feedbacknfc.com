import { type LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type MetricCardProps = {
  title: string
  value: string
  description?: string
  icon?: LucideIcon
  className?: string
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("gap-0", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

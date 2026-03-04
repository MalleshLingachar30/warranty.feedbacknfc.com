import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusTone =
  | "new"
  | "assigned"
  | "in_progress"
  | "awaiting_parts"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "paid"
  | "active"

const toneClasses: Record<StatusTone, string> = {
  new: "bg-blue-100 text-blue-700 border-blue-200",
  assigned: "bg-indigo-100 text-indigo-700 border-indigo-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  awaiting_parts: "bg-orange-100 text-orange-700 border-orange-200",
  submitted: "bg-slate-100 text-slate-700 border-slate-200",
  under_review: "bg-violet-100 text-violet-700 border-violet-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  paid: "bg-teal-100 text-teal-700 border-teal-200",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
}

type StatusBadgeProps = {
  tone: StatusTone
  children: React.ReactNode
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn("font-medium", toneClasses[tone])}>
      {children}
    </Badge>
  )
}

import { ArrowRightCircle, ClipboardList, ScanLine, Wrench } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InternalServicesPlaceholderPage({
  title,
  description,
  nextSteps,
}: {
  title: string;
  description: string;
  nextSteps: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="size-4 text-indigo-600" />
              Context-aware entry
            </CardTitle>
            <CardDescription>
              This route is reserved for Internal Services actions only.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4 text-indigo-600" />
              Separate workflow
            </CardTitle>
            <CardDescription>
              Warranty tickets and customer confirmation stay outside this module.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4 text-indigo-600" />
              Schema-ready
            </CardTitle>
            <CardDescription>
              Internal service order models and lifecycle states are already available.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next build steps for this route</CardTitle>
          <CardDescription>
            The route skeleton is live. The actions below are the intended next implementation slice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {nextSteps.map((step) => (
            <div
              key={step}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <ArrowRightCircle className="mt-0.5 size-4 text-indigo-600" />
              <p className="text-sm text-slate-700">{step}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

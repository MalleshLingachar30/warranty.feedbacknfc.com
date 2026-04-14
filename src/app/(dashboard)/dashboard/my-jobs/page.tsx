import { MyJobsBoard } from "@/components/technician/my-jobs-board";
import { MyInstallationJobsBoard } from "@/components/technician/my-installation-jobs-board";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MyJobsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return first ?? null;
  }

  return null;
}

export default async function MyJobsPage({ searchParams }: MyJobsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tabParam = firstQueryValue(resolvedSearchParams.tab);
  const ticketIdParam = firstQueryValue(resolvedSearchParams.ticket);
  const installationJobIdParam = firstQueryValue(resolvedSearchParams.job);

  const defaultTab =
    tabParam === "installation"
      ? "installation"
      : tabParam === "service"
        ? "service"
        : installationJobIdParam
          ? "installation"
          : ticketIdParam
            ? "service"
            : "service";

  return (
    <div className="mx-auto w-full max-w-md">
      <Tabs defaultValue={defaultTab} className="space-y-3">
        <TabsList className="grid h-12 w-full grid-cols-2">
          <TabsTrigger value="service" className="h-10 text-xs sm:text-sm">
            Service Jobs
          </TabsTrigger>
          <TabsTrigger value="installation" className="h-10 text-xs sm:text-sm">
            Installation Jobs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="service">
          <MyJobsBoard />
        </TabsContent>
        <TabsContent value="installation">
          <MyInstallationJobsBoard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

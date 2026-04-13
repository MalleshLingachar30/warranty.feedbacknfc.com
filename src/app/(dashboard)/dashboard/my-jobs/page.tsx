import { MyJobsBoard } from "@/components/technician/my-jobs-board";
import { MyInstallationJobsBoard } from "@/components/technician/my-installation-jobs-board";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MyJobsPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <Tabs defaultValue="service" className="space-y-3">
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

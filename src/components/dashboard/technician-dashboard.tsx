"use client";

import { MyJobsBoard } from "@/components/technician/my-jobs-board";
import { MyInstallationJobsBoard } from "@/components/technician/my-installation-jobs-board";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TechnicianDashboard() {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
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
          <MyJobsBoard
            title="Technician Dashboard"
            description="Mobile-first service job execution workflow"
          />
        </TabsContent>
        <TabsContent value="installation">
          <MyInstallationJobsBoard
            title="Installation Dashboard"
            description="Mobile-first installation execution and proof capture"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

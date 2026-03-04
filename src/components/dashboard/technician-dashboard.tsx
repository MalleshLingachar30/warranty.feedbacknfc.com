"use client";

import { MyJobsBoard } from "@/components/technician/my-jobs-board";

export function TechnicianDashboard() {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <MyJobsBoard
        title="Technician Dashboard"
        description="Mobile-first job execution workflow"
      />
    </div>
  );
}

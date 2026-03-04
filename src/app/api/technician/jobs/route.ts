import { NextResponse, type NextRequest } from "next/server";

import { resolveTechnicianId } from "@/lib/technician-context";
import { listTechnicianJobs } from "@/lib/warranty-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const technicianId = resolveTechnicianId(request);
    const payload = listTechnicianJobs(technicianId);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load technician jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

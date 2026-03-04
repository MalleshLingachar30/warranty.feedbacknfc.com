import "server-only";

import type { NextRequest } from "next/server";

const DEFAULT_TECHNICIAN_ID = "tech-bharat-001";

interface BodyWithTechnicianId {
  technicianId?: unknown;
}

export function resolveTechnicianId(request: NextRequest, body?: BodyWithTechnicianId) {
  const queryValue = request.nextUrl.searchParams.get("technicianId");
  if (queryValue && queryValue.trim().length > 0) {
    return queryValue.trim();
  }

  const headerValue = request.headers.get("x-technician-id");
  if (headerValue && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  if (body?.technicianId && typeof body.technicianId === "string") {
    const fromBody = body.technicianId.trim();
    if (fromBody.length > 0) {
      return fromBody;
    }
  }

  return DEFAULT_TECHNICIAN_ID;
}

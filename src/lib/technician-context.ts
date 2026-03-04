import "server-only";

import type { NextRequest } from "next/server";

interface BodyWithTechnicianId {
  technicianId?: unknown;
}

const DEFAULT_TECHNICIAN_ID =
  process.env.DEFAULT_TECHNICIAN_ID &&
  process.env.DEFAULT_TECHNICIAN_ID.trim().length > 0
    ? process.env.DEFAULT_TECHNICIAN_ID.trim()
    : null;

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveTechnicianId(
  request: NextRequest,
  body?: BodyWithTechnicianId,
): string | null {
  const queryValue = normalizeIdentifier(
    request.nextUrl.searchParams.get("technicianId"),
  );
  if (queryValue) {
    return queryValue;
  }

  const headerValue = normalizeIdentifier(
    request.headers.get("x-technician-id"),
  );
  if (headerValue) {
    return headerValue;
  }

  const bodyValue = normalizeIdentifier(body?.technicianId);
  if (bodyValue) {
    return bodyValue;
  }

  return DEFAULT_TECHNICIAN_ID;
}

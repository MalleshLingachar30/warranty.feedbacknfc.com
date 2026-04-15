import { type NextRequest, NextResponse } from "next/server";

/**
 * Manual Clerk Frontend API proxy that buffers responses.
 *
 * The built-in Clerk proxy handlers (both middleware and route-handler
 * variants) stream response bodies, which Safari drops when routed
 * through Vercel's edge/serverless runtime.  This handler fetches the
 * full response body first, then returns a buffered NextResponse.
 */

const CLERK_FAPI = "https://frontend-api.clerk.dev";
const PROXY_PATH = "/api/clerk-proxy";

async function proxyToClerk(request: NextRequest) {
  const url = new URL(request.url);
  const clerkPath = url.pathname.replace(PROXY_PATH, "");
  const targetUrl = `${CLERK_FAPI}${clerkPath}${url.search}`;

  // Clone headers, add required Clerk proxy headers
  const headers = new Headers(request.headers);
  headers.set("Clerk-Proxy-Url", `${url.origin}${PROXY_PATH}`);
  headers.set(
    "Clerk-Secret-Key",
    process.env.CLERK_SECRET_KEY || "",
  );
  headers.set(
    "X-Forwarded-For",
    request.headers.get("x-forwarded-for") || "127.0.0.1",
  );
  // Remove host header so it doesn't conflict with the target
  headers.delete("host");

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    // @ts-expect-error -- Next.js fetch supports this
    duplex: body ? "half" : undefined,
  });

  // Buffer the ENTIRE response body before returning
  const responseBody = await upstream.arrayBuffer();

  // Copy response headers, but strip hop-by-hop and problematic headers
  const responseHeaders = new Headers();
  const skipHeaders = new Set([
    "transfer-encoding",
    "connection",
    "keep-alive",
    "content-encoding",
  ]);
  upstream.headers.forEach((value, key) => {
    if (!skipHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // Ensure content-length is set for the buffered body
  responseHeaders.set("Content-Length", String(responseBody.byteLength));

  return new NextResponse(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest) {
  return proxyToClerk(request);
}

export async function POST(request: NextRequest) {
  return proxyToClerk(request);
}

export async function PUT(request: NextRequest) {
  return proxyToClerk(request);
}

export async function DELETE(request: NextRequest) {
  return proxyToClerk(request);
}

export async function PATCH(request: NextRequest) {
  return proxyToClerk(request);
}

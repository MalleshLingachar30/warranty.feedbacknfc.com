import { type NextRequest, NextResponse } from "next/server";

/**
 * Manual Clerk Frontend API proxy that buffers responses.
 *
 * The built-in Clerk proxy handlers (both middleware and route-handler
 * variants) stream response bodies, which Safari drops when routed
 * through Vercel's edge/serverless runtime.  This handler fetches the
 * full response body first, then returns a buffered NextResponse.
 *
 * Clerk's npm endpoints redirect versioned paths (e.g. @6 → @6.7.1)
 * back through the proxy URL so we must follow those redirects
 * server-side, rewriting them back to the Clerk FAPI.
 */

const CLERK_FAPI = "https://frontend-api.clerk.dev";
const PROXY_PATH = "/api/clerk-proxy";
const MAX_REDIRECTS = 5;

async function proxyToClerk(request: NextRequest) {
  const url = new URL(request.url);
  const proxyOrigin = url.origin;
  const clerkPath = url.pathname.replace(PROXY_PATH, "");
  let targetUrl = `${CLERK_FAPI}${clerkPath}${url.search}`;

  // Build headers once
  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.set("Clerk-Proxy-Url", `${proxyOrigin}${PROXY_PATH}`);
  proxyHeaders.set("Clerk-Secret-Key", process.env.CLERK_SECRET_KEY || "");
  proxyHeaders.set(
    "X-Forwarded-For",
    request.headers.get("x-forwarded-for") || "127.0.0.1",
  );
  proxyHeaders.delete("host");

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  // Follow redirects manually so we can rewrite proxy-URL redirects
  // back to the Clerk FAPI origin
  let upstream: Response | undefined;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: i === 0 ? body : undefined,
      redirect: "manual",
      // @ts-expect-error -- Next.js fetch supports this
      duplex: body && i === 0 ? "half" : undefined,
    });

    if (
      upstream.status >= 300 &&
      upstream.status < 400 &&
      upstream.headers.has("location")
    ) {
      let location = upstream.headers.get("location")!;

      // Clerk redirects back through the proxy URL – rewrite to FAPI
      if (location.includes(PROXY_PATH)) {
        const locUrl = new URL(location);
        location = `${CLERK_FAPI}${locUrl.pathname.replace(PROXY_PATH, "")}${locUrl.search}`;
      }

      targetUrl = location;
      continue;
    }

    break;
  }

  if (!upstream) {
    return NextResponse.json(
      { error: "Proxy failed: no upstream response" },
      { status: 502 },
    );
  }

  // Buffer the ENTIRE response body before returning
  const responseBody = await upstream.arrayBuffer();

  // Copy response headers, stripping hop-by-hop and encoding headers
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

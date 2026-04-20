import { NextResponse, type NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3010";

function buildTargetUrl(pathSegments: string[], request: NextRequest): string {
  const upstreamPath = pathSegments.join("/");
  const url = new URL(`/api/${upstreamPath}`, BACKEND_URL);
  url.search = request.nextUrl.search;
  return url.toString();
}

function copyRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    const normalized = key.toLowerCase();
    if (
      normalized === "host" ||
      normalized === "connection" ||
      normalized === "content-length" ||
      normalized === "transfer-encoding"
    ) {
      continue;
    }

    headers.set(key, value);
  }

  return headers;
}

function copyResponseHeaders(source: Headers, target: Headers): void {
  for (const [key, value] of source.entries()) {
    const normalized = key.toLowerCase();
    if (
      normalized === "connection" ||
      normalized === "content-length" ||
      normalized === "content-encoding" ||
      normalized === "transfer-encoding"
    ) {
      continue;
    }

    target.set(key, value);
  }
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  const targetUrl = buildTargetUrl(path, request);
  const method = request.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers: copyRequestHeaders(request),
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNREACHABLE",
          message: "Failed to reach the backend service.",
        },
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  copyResponseHeaders(upstream.headers, responseHeaders);
  const payload = await upstream.arrayBuffer();

  return new NextResponse(payload, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context);
}

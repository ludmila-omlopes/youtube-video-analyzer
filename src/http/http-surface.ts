import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { OAUTH_PROTECTED_RESOURCE_METADATA_PATH } from "../auth-billing/index.js";

import {
  handleApiAudioAnalysisRequest,
  handleApiLongJobStartRequest,
  handleApiLongJobStatusRequest,
  handleApiMetadataRequest,
  handleApiShortAnalysisRequest,
  isApiLongJobStatusPath,
} from "./api.js";
import { handleProtectedMcpHttpRequest } from "./handle-protected-mcp-request.js";
import { handleProtectedResourceMetadataRequest } from "./handle-protected-resource-metadata-request.js";
import {
  handleApiKeysCreateRequest,
  handleApiKeysListRequest,
  handleApiKeysRevokeRequest,
  handleMonetizationScanRequest,
  handleWebAppPageRequest,
  handleWebSessionRequest,
  handleWorkflowRunsRequest,
} from "./web-app.js";

export type HttpSurfaceRouteHandler = (request: Request) => Promise<Response>;

const LANDING_PAGE_PATH = fileURLToPath(new URL("../../public/index.html", import.meta.url));
const LANDING_PAGE_FALLBACK = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>YouTube Analyzer</title></head><body><p>YouTube Analyzer is live at <code>/api/mcp</code>.</p></body></html>`;

let landingPageHtmlPromise: Promise<string> | undefined;

export function methodNotAllowed(allowed: string[]): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow: allowed.join(", "),
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export function healthCheck(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function loadLandingPageHtml(): Promise<string> {
  if (!landingPageHtmlPromise) {
    landingPageHtmlPromise = readFile(LANDING_PAGE_PATH, "utf8").catch(() => LANDING_PAGE_FALLBACK);
  }

  return landingPageHtmlPromise;
}

export async function handleMcpHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleProtectedMcpHttpRequest(request);
}

export async function handleProtectedResourceMetadataHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleProtectedResourceMetadataRequest(request);
}

export async function handleRootHttpSurfaceRequest(_request: Request): Promise<Response> {
  return new Response(await loadLandingPageHtml(), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export async function handleHealthCheckHttpSurfaceRequest(): Promise<Response> {
  return healthCheck();
}

export async function handleWebAppHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleWebAppPageRequest();
}

export async function handleWebSessionHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleWebSessionRequest(request);
}

export async function handleWebWorkflowRunsHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleWorkflowRunsRequest(request);
}

export async function handleWebMonetizationScanHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleMonetizationScanRequest(request);
}

export async function handleWebApiKeysListHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiKeysListRequest(request);
}

export async function handleWebApiKeysCreateHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiKeysCreateRequest(request);
}

export async function handleWebApiKeysRevokeHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiKeysRevokeRequest(request);
}

export async function handleApiMetadataHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiMetadataRequest(request);
}

export async function handleApiShortAnalysisHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiShortAnalysisRequest(request);
}

export async function handleApiAudioAnalysisHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiAudioAnalysisRequest(request);
}

export async function handleApiLongJobStartHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiLongJobStartRequest(request);
}

export async function handleApiLongJobStatusHttpSurfaceRequest(request: Request): Promise<Response> {
  return handleApiLongJobStatusRequest(request);
}

export function resolveHttpSurfaceRoute(pathname: string, method: string): HttpSurfaceRouteHandler | Response {
  if (pathname === "/api/mcp") {
    if (method === "GET" || method === "POST" || method === "DELETE") {
      return handleMcpHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET", "POST", "DELETE"]);
  }

  if (pathname === OAUTH_PROTECTED_RESOURCE_METADATA_PATH) {
    if (method === "GET") {
      return handleProtectedResourceMetadataHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/healthz") {
    if (method === "GET") {
      return handleHealthCheckHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/api/web/session") {
    if (method === "GET") {
      return handleWebSessionHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/api/web/runs") {
    if (method === "GET") {
      return handleWebWorkflowRunsHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/api/web/monetization-scan") {
    if (method === "POST") {
      return handleWebMonetizationScanHttpSurfaceRequest;
    }

    return methodNotAllowed(["POST"]);
  }

  if (pathname === "/api/web/api-keys") {
    if (method === "GET") {
      return handleWebApiKeysListHttpSurfaceRequest;
    }

    if (method === "POST") {
      return handleWebApiKeysCreateHttpSurfaceRequest;
    }

    if (method === "DELETE") {
      return handleWebApiKeysRevokeHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET", "POST", "DELETE"]);
  }

  if (pathname === "/api/v1/metadata") {
    if (method === "POST") {
      return handleApiMetadataHttpSurfaceRequest;
    }

    return methodNotAllowed(["POST"]);
  }

  if (pathname === "/api/v1/analyze/short") {
    if (method === "POST") {
      return handleApiShortAnalysisHttpSurfaceRequest;
    }

    return methodNotAllowed(["POST"]);
  }

  if (pathname === "/api/v1/analyze/audio") {
    if (method === "POST") {
      return handleApiAudioAnalysisHttpSurfaceRequest;
    }

    return methodNotAllowed(["POST"]);
  }

  if (pathname === "/api/v1/long-jobs") {
    if (method === "POST") {
      return handleApiLongJobStartHttpSurfaceRequest;
    }

    return methodNotAllowed(["POST"]);
  }

  if (isApiLongJobStatusPath(pathname)) {
    if (method === "GET") {
      return handleApiLongJobStatusHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/app" || pathname === "/app/") {
    if (method === "GET") {
      return handleWebAppHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/" || pathname === "") {
    return handleRootHttpSurfaceRequest;
  }

  return notFound();
}

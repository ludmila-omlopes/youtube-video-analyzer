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
import { handleProtectedResourceMetadataRequest } from "./handle-protected-resource-metadata-request.js";
import {
  handleAdminAccountGetHttpRequest,
  handleAdminAccountGrantCreditsHttpRequest,
  handleAdminAccountPlanHttpRequest,
  handleAdminAccountsListRequest,
  handleAdminConsolePageRequest,
} from "./admin-http.js";
import {
  handleHostedLoginStartRequest,
  handleHostedLogoutRequest,
  handleHostedOAuthCallbackRequest,
  handleLegacyAppRedirectRequest,
  oauthCallbackPathMatches,
} from "./oauth-hosted-login.js";
import { renderApiDocsPageHtml } from "./render-api-docs-html.js";
import {
  handleMonetizationScanRequest,
  handleWebSessionRequest,
  handleWorkflowRunsRequest,
} from "./web-app.js";

export type HttpSurfaceRouteHandler = (request: Request) => Promise<Response>;

const LANDING_PAGE_PATH = fileURLToPath(new URL("../../public/index.html", import.meta.url));
const LANDING_PAGE_FALLBACK = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>YouTube Video Analyzer</title></head><body><p>YouTube Video Analyzer is live. See <code>/docs/api</code> for the HTTP API.</p></body></html>`;

const DASHBOARD_PAGE_PATH = fileURLToPath(new URL("../../public/dashboard.html", import.meta.url));
const DASHBOARD_PAGE_FALLBACK = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Account</title></head><body><p>Dashboard unavailable.</p></body></html>`;

const API_DOC_MD_PATH = fileURLToPath(new URL("../../docs/API.md", import.meta.url));
const API_DOC_FALLBACK =
  "# Hosted HTTP API\n\nDocumentation file `docs/API.md` was not found on this server. See the package or repository copy.\n";

let landingPageHtmlPromise: Promise<string> | undefined;
let dashboardPageHtmlPromise: Promise<string> | undefined;
let apiDocMarkdownPromise: Promise<string> | undefined;
let apiDocHtmlPagePromise: Promise<string> | undefined;

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

async function loadDashboardPageHtml(): Promise<string> {
  if (!dashboardPageHtmlPromise) {
    dashboardPageHtmlPromise = readFile(DASHBOARD_PAGE_PATH, "utf8").catch(() => DASHBOARD_PAGE_FALLBACK);
  }

  return dashboardPageHtmlPromise;
}

async function loadApiDocMarkdown(): Promise<string> {
  if (!apiDocMarkdownPromise) {
    apiDocMarkdownPromise = readFile(API_DOC_MD_PATH, "utf8").catch(() => API_DOC_FALLBACK);
  }

  return apiDocMarkdownPromise;
}

async function loadApiDocHtmlPage(): Promise<string> {
  if (!apiDocHtmlPagePromise) {
    apiDocHtmlPagePromise = loadApiDocMarkdown().then((md) => renderApiDocsPageHtml(md));
  }

  return apiDocHtmlPagePromise;
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

export async function handleDashboardHttpSurfaceRequest(_request: Request): Promise<Response> {
  return new Response(await loadDashboardPageHtml(), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export async function handleDocsApiHtmlSurfaceRequest(_request: Request): Promise<Response> {
  return new Response(await loadApiDocHtmlPage(), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export async function handleDocsApiRawHttpSurfaceRequest(_request: Request): Promise<Response> {
  return new Response(await loadApiDocMarkdown(), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/markdown; charset=utf-8",
    },
  });
}

export async function handleHealthCheckHttpSurfaceRequest(): Promise<Response> {
  return healthCheck();
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

  if (pathname === "/docs/api/raw" || pathname === "/docs/api/raw/") {
    if (method === "GET") {
      return handleDocsApiRawHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/docs/api" || pathname === "/docs/api/") {
    if (method === "GET") {
      return handleDocsApiHtmlSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (oauthCallbackPathMatches(pathname)) {
    if (method === "GET") {
      return handleHostedOAuthCallbackRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/login" || pathname === "/login/") {
    if (method === "GET") {
      return handleHostedLoginStartRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/logout" || pathname === "/logout/") {
    if (method === "GET" || method === "POST") {
      return handleHostedLogoutRequest;
    }

    return methodNotAllowed(["GET", "POST"]);
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

  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    if (method === "GET") {
      return handleDashboardHttpSurfaceRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/app" || pathname === "/app/") {
    if (method === "GET") {
      return handleLegacyAppRedirectRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/admin/console" || pathname === "/admin/console/") {
    if (method === "GET") {
      return handleAdminConsolePageRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/admin/api/accounts") {
    if (method === "GET") {
      return handleAdminAccountsListRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/admin/api/account") {
    if (method === "GET") {
      return handleAdminAccountGetHttpRequest;
    }

    return methodNotAllowed(["GET"]);
  }

  if (pathname === "/admin/api/account/plan") {
    if (method === "POST") {
      return handleAdminAccountPlanHttpRequest;
    }

    return methodNotAllowed(["POST"]);
  }

  if (pathname === "/admin/api/account/grant-credits") {
    if (method === "POST") {
      return handleAdminAccountGrantCreditsHttpRequest;
    }

    return methodNotAllowed(["POST"]);
  }

  if (pathname === "/" || pathname === "") {
    return handleRootHttpSurfaceRequest;
  }

  return notFound();
}

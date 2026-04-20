import assert from "node:assert/strict";

import { OAUTH_PROTECTED_RESOURCE_METADATA_PATH } from "../lib/auth/protected-resource-metadata.js";
import {
  handleApiMetadataHttpSurfaceRequest,
  handleDocsApiHtmlSurfaceRequest,
  handleDocsApiRawHttpSurfaceRequest,
  resolveHttpSurfaceRoute,
} from "../http/http-surface.js";

export async function run(): Promise<void> {
  const mcpGetRoute = resolveHttpSurfaceRoute("/api/mcp", "GET");
  assert.equal(mcpGetRoute instanceof Response, true);
  assert.equal((mcpGetRoute as Response).status, 404);

  const metadataGetRoute = resolveHttpSurfaceRoute(OAUTH_PROTECTED_RESOURCE_METADATA_PATH, "GET");
  assert.equal(metadataGetRoute instanceof Response, false);

  const rootRoute = resolveHttpSurfaceRoute("/", "GET");
  assert.equal(rootRoute instanceof Response, false);
  const rootResponse = await (rootRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/")
  );
  const rootHtml = await rootResponse.text();
  assert.equal(rootResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(rootHtml, /YouTube Video Analyzer \| YouTube Intelligence Platform/);
  assert.match(rootHtml, /Turn public videos into/);
  assert.match(rootHtml, /\/docs\/api/);
  assert.match(rootHtml, /\/login/);

  const dashboardRoute = resolveHttpSurfaceRoute("/dashboard", "GET");
  assert.equal(dashboardRoute instanceof Response, false);
  const dashboardResponse = await (dashboardRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/dashboard")
  );
  const dashboardHtml = await dashboardResponse.text();
  assert.equal(dashboardResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(dashboardHtml, /Account/);
  assert.match(dashboardHtml, /YouTube Video Analyzer/);
  assert.match(dashboardHtml, /\/api\/web\/session/);

  const appRoute = resolveHttpSurfaceRoute("/app", "GET");
  assert.equal(appRoute instanceof Response, false);
  const appResponse = await (appRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/app")
  );
  assert.equal(appResponse.status, 302);
  assert.equal(appResponse.headers.get("location"), "/dashboard");

  const loginRoute = resolveHttpSurfaceRoute("/login", "GET");
  assert.equal(loginRoute instanceof Response, false);
  const loginResponse = await (loginRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/login")
  );
  assert.equal(loginResponse.status, 503);
  const loginPayload = (await loginResponse.json()) as { error: { code: string } };
  assert.equal(loginPayload.error.code, "OAUTH_BROWSER_NOT_CONFIGURED");

  const callbackRoute = resolveHttpSurfaceRoute("/oauth/callback", "GET");
  assert.equal(callbackRoute instanceof Response, false);

  const docsHtmlRoute = resolveHttpSurfaceRoute("/docs/api", "GET");
  assert.equal(docsHtmlRoute instanceof Response, false);
  assert.equal(docsHtmlRoute, handleDocsApiHtmlSurfaceRequest);
  const docsHtmlResponse = await (docsHtmlRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/docs/api")
  );
  const docsHtmlBody = await docsHtmlResponse.text();
  assert.equal(docsHtmlResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(docsHtmlBody, /HTTP API reference/);
  assert.match(docsHtmlBody, /YouTube Video Analyzer/);
  assert.match(docsHtmlBody, /<article class="doc">/);
  assert.match(docsHtmlBody, /Hosted HTTP API/);

  const docsRawRoute = resolveHttpSurfaceRoute("/docs/api/raw", "GET");
  assert.equal(docsRawRoute instanceof Response, false);
  assert.equal(docsRawRoute, handleDocsApiRawHttpSurfaceRequest);
  const docsRawResponse = await (docsRawRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/docs/api/raw")
  );
  const docsRawBody = await docsRawResponse.text();
  assert.equal(docsRawResponse.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.match(docsRawBody, /^# Hosted HTTP API/m);

  const healthRoute = resolveHttpSurfaceRoute("/healthz", "GET");
  assert.equal(healthRoute instanceof Response, false);
  const healthResponse = await (healthRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/healthz")
  );
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });

  const methodNotAllowed = resolveHttpSurfaceRoute("/api/v1/metadata", "PUT");
  assert.equal(methodNotAllowed instanceof Response, true);
  assert.equal((methodNotAllowed as Response).status, 405);

  const webSessionRoute = resolveHttpSurfaceRoute("/api/web/session", "GET");
  assert.equal(webSessionRoute instanceof Response, false);

  const webScanRoute = resolveHttpSurfaceRoute("/api/web/monetization-scan", "POST");
  assert.equal(webScanRoute instanceof Response, false);

  const apiMetadataRoute = resolveHttpSurfaceRoute("/api/v1/metadata", "POST");
  assert.equal(apiMetadataRoute instanceof Response, false);
  assert.equal(apiMetadataRoute, handleApiMetadataHttpSurfaceRequest);

  const apiShortRoute = resolveHttpSurfaceRoute("/api/v1/analyze/short", "POST");
  assert.equal(apiShortRoute instanceof Response, false);

  const apiAudioRoute = resolveHttpSurfaceRoute("/api/v1/analyze/audio", "POST");
  assert.equal(apiAudioRoute instanceof Response, false);

  const apiLongJobsRoute = resolveHttpSurfaceRoute("/api/v1/long-jobs", "POST");
  assert.equal(apiLongJobsRoute instanceof Response, false);

  const apiLongJobStatusRoute = resolveHttpSurfaceRoute("/api/v1/long-jobs/job-123", "GET");
  assert.equal(apiLongJobStatusRoute instanceof Response, false);

  const missingRoute = resolveHttpSurfaceRoute("/missing", "GET");
  assert.equal(missingRoute instanceof Response, true);
  assert.equal((missingRoute as Response).status, 404);
}

import assert from "node:assert/strict";

import { OAUTH_PROTECTED_RESOURCE_METADATA_PATH } from "../lib/auth/protected-resource-metadata.js";
import {
  handleApiMetadataHttpSurfaceRequest,
  handleMcpHttpSurfaceRequest,
  resolveHttpSurfaceRoute,
} from "../http/http-surface.js";

export async function run(): Promise<void> {
  const mcpGetRoute = resolveHttpSurfaceRoute("/api/mcp", "GET");
  assert.equal(mcpGetRoute instanceof Response, false);
  assert.equal(mcpGetRoute, handleMcpHttpSurfaceRequest);

  const metadataGetRoute = resolveHttpSurfaceRoute(OAUTH_PROTECTED_RESOURCE_METADATA_PATH, "GET");
  assert.equal(metadataGetRoute instanceof Response, false);

  const rootRoute = resolveHttpSurfaceRoute("/", "GET");
  assert.equal(rootRoute instanceof Response, false);
  const rootResponse = await (rootRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/")
  );
  const rootHtml = await rootResponse.text();
  assert.equal(rootResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(rootHtml, /YouTube Analyzer \| YouTube Intelligence Platform/);
  assert.match(rootHtml, /Turn public videos into/);
  assert.match(rootHtml, /\/api\/mcp/);
  assert.match(rootHtml, /\/app/);

  const appRoute = resolveHttpSurfaceRoute("/app", "GET");
  assert.equal(appRoute instanceof Response, false);
  const appResponse = await (appRoute as () => Promise<Response>)();
  const appHtml = await appResponse.text();
  assert.equal(appResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(appHtml, /Monetization Scan/);
  assert.match(appHtml, /web workflow shell/i);

  const healthRoute = resolveHttpSurfaceRoute("/healthz", "GET");
  assert.equal(healthRoute instanceof Response, false);
  const healthResponse = await (healthRoute as (request: Request) => Promise<Response>)(
    new Request("https://example.com/healthz")
  );
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });

  const methodNotAllowed = resolveHttpSurfaceRoute("/api/mcp", "PUT");
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

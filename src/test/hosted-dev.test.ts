import assert from "node:assert/strict";

import { OAUTH_PROTECTED_RESOURCE_METADATA_PATH } from "../lib/auth/protected-resource-metadata.js";
import {
  getHostedServerConfig,
  getPublicOriginFromHeaders,
  resolveRoute,
} from "../dev/hosted.js";

const OAUTH_ENV_KEYS = [
  "ALLOW_UNAUTHENTICATED_HOSTED_DEV",
  "OAUTH_ENABLED",
  "OAUTH_ISSUER",
  "OAUTH_AUDIENCE",
  "OAUTH_JWKS_URL",
  "OAUTH_REQUIRED_SCOPE",
] as const;

async function withEnv(
  updates: Partial<Record<(typeof OAUTH_ENV_KEYS)[number], string | undefined>>,
  runWithEnv: () => Promise<void>
): Promise<void> {
  const previous = Object.fromEntries(OAUTH_ENV_KEYS.map((key) => [key, process.env[key]])) as Partial<
    Record<(typeof OAUTH_ENV_KEYS)[number], string | undefined>
  >;

  try {
    for (const key of OAUTH_ENV_KEYS) {
      const next = updates[key];
      if (next === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = next;
      }
    }

    await runWithEnv();
  } finally {
    for (const key of OAUTH_ENV_KEYS) {
      const next = previous[key];
      if (next === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = next;
      }
    }
  }
}

export async function run(): Promise<void> {
  assert.deepEqual(getHostedServerConfig(), {
    host: "127.0.0.1",
    port: 3010,
  });
  assert.deepEqual(getHostedServerConfig({ PORT: "10000" }), {
    host: "0.0.0.0",
    port: 10000,
  });
  assert.equal(
    getPublicOriginFromHeaders(
      {
        host: "0.0.0.0:10000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "youtube-video-analyzer.onrender.com",
      },
      "0.0.0.0:10000"
    ),
    "https://youtube-video-analyzer.onrender.com"
  );

  const rootRoute = resolveRoute("/", "GET");
  assert.equal(rootRoute instanceof Response, false);
  const appRoute = resolveRoute("/app", "GET");
  assert.equal(appRoute instanceof Response, false);

  const rootResponse = await (rootRoute as (request: Request) => Promise<Response>)(
    new Request("http://127.0.0.1:3010/")
  );
  const rootHtml = await rootResponse.text();

  assert.equal(rootResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(rootHtml, /YouTube Video Analyzer \| YouTube Intelligence Platform/);
  assert.match(rootHtml, /Render is the production path/);
  assert.match(rootHtml, /\/docs\/api/);

  const proxiedRootResponse = await (rootRoute as (request: Request) => Promise<Response>)(
    new Request("https://youtube-video-analyzer.onrender.com/")
  );
  const proxiedRootHtml = await proxiedRootResponse.text();

  assert.equal(proxiedRootResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(proxiedRootHtml, /Vercel is optional/);

  const appResponse = await (appRoute as (request: Request) => Promise<Response>)(
    new Request("http://127.0.0.1:3010/app")
  );
  assert.equal(appResponse.status, 302);
  assert.equal(appResponse.headers.get("location"), "/dashboard");

  const removedMcpRoute = resolveRoute("/api/mcp", "GET");
  assert.equal(removedMcpRoute instanceof Response, true);
  assert.equal((removedMcpRoute as Response).status, 404);
  const webSessionRoute = resolveRoute("/api/web/session", "GET");
  assert.equal(webSessionRoute instanceof Response, false);

  const metadataRoute = resolveRoute(OAUTH_PROTECTED_RESOURCE_METADATA_PATH, "GET");
  assert.equal(metadataRoute instanceof Response, false);

  await withEnv({}, async () => {
    const metadataResponse = await (metadataRoute as (request: Request) => Promise<Response>)(
      new Request(`http://127.0.0.1:3010${OAUTH_PROTECTED_RESOURCE_METADATA_PATH}`)
    );
    const metadataPayload = (await metadataResponse.json()) as { error: string };
    assert.equal(metadataResponse.status, 503);
    assert.equal(metadataPayload.error, "server_configuration_error");

    const webSessionResponse = await (webSessionRoute as (request: Request) => Promise<Response>)(
      new Request("http://127.0.0.1:3010/api/web/session")
    );
    const webSessionPayload = (await webSessionResponse.json()) as {
      error: { code: string };
    };
    assert.equal(webSessionResponse.status, 503);
    assert.equal(webSessionPayload.error.code, "HOSTED_AUTH_CONFIGURATION_INVALID");
  });

  await withEnv(
    {
      ALLOW_UNAUTHENTICATED_HOSTED_DEV: "true",
    },
    async () => {
      const metadataResponse = await (metadataRoute as (request: Request) => Promise<Response>)(
        new Request(`http://127.0.0.1:3010${OAUTH_PROTECTED_RESOURCE_METADATA_PATH}`)
      );
      assert.equal(metadataResponse.status, 404);

      const webSessionResponse = await (webSessionRoute as (request: Request) => Promise<Response>)(
        new Request("http://127.0.0.1:3010/api/web/session")
      );
      const webSessionPayload = (await webSessionResponse.json()) as {
        auth: { mode: string };
        account: { accountId: string };
      };
      assert.equal(webSessionResponse.status, 200);
      assert.equal(webSessionPayload.auth.mode, "local");
      assert.match(webSessionPayload.account.accountId, /^local:\/\/youtube-video-analyzer-web:/);
    }
  );

  await withEnv(
    {
      ALLOW_UNAUTHENTICATED_HOSTED_DEV: undefined,
      OAUTH_ENABLED: "true",
      OAUTH_ISSUER: "https://issuer.example.com/",
      OAUTH_AUDIENCE: "https://youtube-video-analyzer.onrender.com/",
      OAUTH_JWKS_URL: "https://issuer.example.com/.well-known/jwks.json",
      OAUTH_REQUIRED_SCOPE: "mcp:access",
    },
    async () => {
      const enabledMetadataResponse = await (metadataRoute as (request: Request) => Promise<Response>)(
        new Request(`https://youtube-video-analyzer.onrender.com${OAUTH_PROTECTED_RESOURCE_METADATA_PATH}`)
      );
      const metadataPayload = (await enabledMetadataResponse.json()) as {
        resource: string;
        authorization_servers: string[];
        bearer_methods_supported: string[];
        scopes_supported?: string[];
      };

      assert.equal(enabledMetadataResponse.status, 200);
      assert.deepEqual(metadataPayload, {
        resource: "https://youtube-video-analyzer.onrender.com/",
        authorization_servers: ["https://issuer.example.com/"],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp:access"],
      });
    }
  );

  const healthRoute = resolveRoute("/healthz", "GET");
  assert.equal(healthRoute instanceof Response, false);

  const healthResponse = await (healthRoute as (request: Request) => Promise<Response>)(
    new Request("http://127.0.0.1:3010/healthz")
  );
  const healthPayload = (await healthResponse.json()) as { ok: boolean };

  assert.equal(healthResponse.status, 200);
  assert.equal(healthPayload.ok, true);

  const authRoute = resolveRoute("/api/auth/signin", "GET");
  assert.equal(authRoute instanceof Response, true);
  assert.equal((authRoute as Response).status, 404);

  const settingsRoute = resolveRoute("/api/settings", "GET");
  assert.equal(settingsRoute instanceof Response, true);
  assert.equal((settingsRoute as Response).status, 404);
}

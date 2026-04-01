import assert from "node:assert/strict";

import { OAUTH_PROTECTED_RESOURCE_METADATA_PATH } from "../lib/auth/protected-resource-metadata.js";
import {
  getHostedServerConfig,
  getPublicOriginFromHeaders,
  resolveRoute,
} from "../dev/hosted.js";

const OAUTH_ENV_KEYS = [
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
        "x-forwarded-host": "youtube-analyzer.onrender.com",
      },
      "0.0.0.0:10000"
    ),
    "https://youtube-analyzer.onrender.com"
  );

  const rootRoute = resolveRoute("/", "GET");
  assert.equal(rootRoute instanceof Response, false);

  const rootResponse = await (rootRoute as (request: Request) => Promise<Response>)(
    new Request("http://127.0.0.1:3010/")
  );
  const payload = (await rootResponse.json()) as { ok: boolean; mcpUrl: string; settingsUrl?: string; authSignInUrl?: string };

  assert.equal(payload.ok, true);
  assert.equal(payload.mcpUrl, "http://127.0.0.1:3010/api/mcp");
  assert.equal("settingsUrl" in payload, false);
  assert.equal("authSignInUrl" in payload, false);

  const proxiedRootResponse = await (rootRoute as (request: Request) => Promise<Response>)(
    new Request("https://youtube-analyzer.onrender.com/")
  );
  const proxiedPayload = (await proxiedRootResponse.json()) as { ok: boolean; mcpUrl: string };

  assert.equal(proxiedPayload.ok, true);
  assert.equal(proxiedPayload.mcpUrl, "https://youtube-analyzer.onrender.com/api/mcp");

  const mcpGetRoute = resolveRoute("/api/mcp", "GET");
  assert.equal(mcpGetRoute instanceof Response, false);

  const metadataRoute = resolveRoute(OAUTH_PROTECTED_RESOURCE_METADATA_PATH, "GET");
  assert.equal(metadataRoute instanceof Response, false);

  const metadataResponse = await (metadataRoute as (request: Request) => Promise<Response>)(
    new Request(`http://127.0.0.1:3010${OAUTH_PROTECTED_RESOURCE_METADATA_PATH}`)
  );
  assert.equal(metadataResponse.status, 404);

  await withEnv(
    {
      OAUTH_ENABLED: "true",
      OAUTH_ISSUER: "https://issuer.example.com/",
      OAUTH_AUDIENCE: "https://youtube-analyzer.onrender.com/api/mcp",
      OAUTH_JWKS_URL: "https://issuer.example.com/.well-known/jwks.json",
      OAUTH_REQUIRED_SCOPE: "mcp:access",
    },
    async () => {
      const enabledMetadataResponse = await (metadataRoute as (request: Request) => Promise<Response>)(
        new Request(`https://youtube-analyzer.onrender.com${OAUTH_PROTECTED_RESOURCE_METADATA_PATH}`)
      );
      const metadataPayload = (await enabledMetadataResponse.json()) as {
        resource: string;
        authorization_servers: string[];
        bearer_methods_supported: string[];
        scopes_supported?: string[];
      };

      assert.equal(enabledMetadataResponse.status, 200);
      assert.deepEqual(metadataPayload, {
        resource: "https://youtube-analyzer.onrender.com/api/mcp",
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

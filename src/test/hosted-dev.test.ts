import assert from "node:assert/strict";

import { resolveRoute } from "../dev/hosted.js";

export async function run(): Promise<void> {
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

  const mcpGetRoute = resolveRoute("/api/mcp", "GET");
  assert.equal(mcpGetRoute instanceof Response, false);

  const authRoute = resolveRoute("/api/auth/signin", "GET");
  assert.equal(authRoute instanceof Response, true);
  assert.equal((authRoute as Response).status, 404);

  const settingsRoute = resolveRoute("/api/settings", "GET");
  assert.equal(settingsRoute instanceof Response, true);
  assert.equal((settingsRoute as Response).status, 404);
}

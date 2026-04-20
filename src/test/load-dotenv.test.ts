import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadAppDotenv } from "../lib/load-dotenv.js";

export async function run(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "youtube-analyzer-env-"));
  const prevProfile = process.env.OAUTH_ENV_PROFILE;
  const prevClient = process.env.OAUTH_WEB_CLIENT_ID;
  const prevShared = process.env.SHARED_FLAG;

  try {
    writeFileSync(
      join(dir, ".env"),
      ["SHARED_FLAG=from-env", "OAUTH_WEB_CLIENT_ID=from-env", ""].join("\n")
    );
    writeFileSync(join(dir, ".env.oauth.local"), ["OAUTH_WEB_CLIENT_ID=from-oauth-local", ""].join("\n"));

    delete process.env.OAUTH_ENV_PROFILE;
    delete process.env.OAUTH_WEB_CLIENT_ID;
    delete process.env.SHARED_FLAG;

    loadAppDotenv(dir);
    assert.equal(process.env.OAUTH_WEB_CLIENT_ID, "from-env");
    assert.equal(process.env.SHARED_FLAG, "from-env");

    process.env.OAUTH_ENV_PROFILE = "local";
    delete process.env.OAUTH_WEB_CLIENT_ID;
    delete process.env.SHARED_FLAG;

    loadAppDotenv(dir);
    assert.equal(process.env.OAUTH_WEB_CLIENT_ID, "from-oauth-local");
    assert.equal(process.env.SHARED_FLAG, "from-env");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (prevProfile === undefined) {
      delete process.env.OAUTH_ENV_PROFILE;
    } else {
      process.env.OAUTH_ENV_PROFILE = prevProfile;
    }
    if (prevClient === undefined) {
      delete process.env.OAUTH_WEB_CLIENT_ID;
    } else {
      process.env.OAUTH_WEB_CLIENT_ID = prevClient;
    }
    if (prevShared === undefined) {
      delete process.env.SHARED_FLAG;
    } else {
      process.env.SHARED_FLAG = prevShared;
    }
  }
}

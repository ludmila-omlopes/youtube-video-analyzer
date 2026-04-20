import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads env files in order (later overrides earlier):
 * 1. `.env`
 * 2. If `OAUTH_ENV_PROFILE=local` → `.env.oauth.local`
 *    If `OAUTH_ENV_PROFILE=production` → `.env.oauth.production` (when present)
 * 3. `.env.local` (optional machine-specific overrides)
 *
 * Use `npm run dev:hosted:oauth-local` to set `OAUTH_ENV_PROFILE=local` without editing `.env`.
 */
export function loadAppDotenv(cwd: string = process.cwd()): void {
  const envPath = resolve(cwd, ".env");
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }

  const profile = process.env.OAUTH_ENV_PROFILE?.trim().toLowerCase();
  if (profile === "local") {
    const localOAuthPath = resolve(cwd, ".env.oauth.local");
    if (existsSync(localOAuthPath)) {
      config({ path: localOAuthPath, override: true });
    } else {
      console.warn(
        `[env] OAUTH_ENV_PROFILE=local but ${localOAuthPath} not found. Copy .env.oauth.local.example and adjust.`
      );
    }
  } else if (profile === "production") {
    const prodOAuthPath = resolve(cwd, ".env.oauth.production");
    if (existsSync(prodOAuthPath)) {
      config({ path: prodOAuthPath, override: true });
    }
  }

  const envLocalPath = resolve(cwd, ".env.local");
  if (existsSync(envLocalPath)) {
    config({ path: envLocalPath, override: true });
  }
}

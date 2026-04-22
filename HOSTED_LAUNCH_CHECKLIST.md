# Hosted Launch Checklist

This checklist is for releasing the hosted product, not for publishing the npm package. The product release path in this repository is the Render deployment plus the worker, Redis, admin dashboard, and OAuth configuration.

## Stack

Deploy the services defined in [render.yaml](./render.yaml):

- `youtube-video-analyzer` web service
- `youtube-video-analyzer-worker` background worker
- `youtube-video-analyzer-admin` admin dashboard
- `youtube-video-analyzer-redis` Key Value / Redis

All hosted runtimes now validate launch configuration at startup. If a required secret is missing, the process exits early instead of starting in a partially working state.

## Required Configuration

### Web service

Required env:

- `HOSTED_RUNTIME_ROLE=web`
- `CLOUD_DURABILITY_MODE=require_redis`
- `GEMINI_API_KEY`
- `YOUTUBE_API_KEY`
- `REDIS_HOST` / `REDIS_PORT` or `REDIS_URL`
- `OAUTH_ENABLED=true`
- `OAUTH_ISSUER`
- `OAUTH_AUDIENCE`
- `OAUTH_JWKS_URL`
- `OAUTH_WEB_CLIENT_ID`
- `OAUTH_WEB_AUTHORIZATION_URL`
- `OAUTH_WEB_TOKEN_URL`

Recommended:

- `OAUTH_REQUIRED_SCOPE=mcp:access`
- `OAUTH_WEB_REDIRECT_PATH=/oauth/callback`
- `OAUTH_WEB_SCOPES=openid profile mcp:access`
- `OAUTH_WEB_AUDIENCE`
- `OAUTH_WEB_RESOURCE`

Do not set `ALLOW_UNAUTHENTICATED_HOSTED_DEV=true` in production.

### Worker service

Required env:

- `HOSTED_RUNTIME_ROLE=worker`
- `CLOUD_DURABILITY_MODE=require_redis`
- `GEMINI_API_KEY`
- `REDIS_HOST` / `REDIS_PORT` or `REDIS_URL`

### Admin service

Required env:

- `HOSTED_RUNTIME_ROLE=admin`
- `CLOUD_DURABILITY_MODE=require_redis`
- `REDIS_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Recommended:

- `BULL_BOARD_READ_ONLY=true`

## First Deploy Smoke Test

Run these after Render reports healthy services.

1. Open `/healthz` on the web service and confirm `{ "ok": true }`.
2. Open `/dashboard` and confirm the browser auth flow loads instead of a local dev bypass.
3. Complete sign-in and verify `/api/web/session` returns an authenticated account payload.
4. Create an API key from the dashboard.
5. Call `POST /api/v1/metadata` with the bearer token or API key.
6. Call `POST /api/v1/analyze/short` and confirm credits settle correctly.
7. Call `POST /api/v1/analyze/audio` and confirm credits settle correctly.
8. Call `POST /api/v1/long-jobs`, then poll `GET /api/v1/long-jobs/:jobId` until terminal status.
9. Open **`GET /docs/api`** (and optionally **`GET /docs/api/raw`**) and confirm the hosted API reference renders.
10. Open the admin service and confirm `/admin/queues` loads behind basic auth.
11. Call `GET /admin/api/account` for a real hosted account.
12. Call `POST /admin/api/account/plan` and `POST /admin/api/account/grant-credits` to verify beta operations.

## Beta Operations

Before inviting external users:

- Create at least one test account through the real browser auth flow.
- Verify trial entitlements and initial credits look correct.
- Change that account to `builder` or `pro` from the admin API.
- Grant extra credits manually and confirm the ledger records the event.
- Verify the same account balance appears consistently in `/dashboard` and `/api/v1/*`.
- Confirm a failed long job releases its reservation.

## Launch Decision

You are ready for a hosted beta when all of the following are true:

- web, worker, and admin boot cleanly with production secrets
- `/dashboard` and `/api/v1/*` require authenticated access (or explicit local-dev bypass only when configured)
- Redis-backed durability is active for hosted state
- long jobs complete through the worker and settle credits correctly
- admin plan changes and credit grants work without direct datastore edits

The npm package can remain unpublished while you launch the hosted product.

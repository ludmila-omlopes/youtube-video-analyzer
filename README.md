# YouTube Video Analyzer (hosted platform)

This repository is the **hosted product** and npm package **`@ludylops/youtube-video-analyzer`**: an Express-based HTTP server, browser flows (`/login`, `/app`, `/dashboard`), a **versioned REST API** under `/api/v1`, account-scoped JSON under `/api/web`, Redis-backed **BullMQ** long-video jobs, and an operator admin surface. Shared analysis logic lives in the workspace package **`@ludylops/video-analysis-core`**.

The **MCP `stdio` server** (registry entrypoint, local tools, and MCP Registry metadata) is developed and published from the sibling repository **[youtube-video-analyzer-mcp-server](https://github.com/ludmila-omlopes/youtube-video-analyzer-mcp-server)** (`npm` package **`@ludylops/youtube-video-analyzer-mcp`**). This monorepo intentionally does **not** expose MCP over HTTP (`/api/mcp` is removed).

## Features

- **REST**: `POST /api/v1/metadata`, `POST /api/v1/analyze/short`, `POST /api/v1/analyze/audio`, long jobs under `POST /api/v1/long-jobs` and `GET /api/v1/long-jobs/:jobId` (with worker + Redis when configured)
- **Web session API**: `/api/web/session`, workflow helpers, API keys (plan-gated)
- **Human-readable API reference**: `GET /docs/api` (HTML), `GET /docs/api/raw` (Markdown) — see also [docs/API.md](docs/API.md)
- **OAuth** for hosted access (`OAUTH_*`, `OAUTH_WEB_*`) and optional **API keys** for programmatic clients
- **Credits / accounts** for hosted analysis runs
- **BullMQ admin** (`npm run start:admin`) for queue inspection

## Prerequisites

- Node.js 20+
- `GEMINI_API_KEY`, `YOUTUBE_API_KEY` for hosted analysis and metadata
- For async long jobs and cloud durability: Redis (`REDIS_URL` or `REDIS_HOST` / `REDIS_PORT`) and **`npm run start:worker`**
- Production-style hosted mode expects OAuth and Redis; see [HOSTED_LAUNCH_CHECKLIST.md](./HOSTED_LAUNCH_CHECKLIST.md)

## Setup

```bash
npm install
copy .env.example .env
npm run build
```

## Running locally

**Hosted HTTP (default dev entrypoint):**

```bash
npm run dev
```

Same as `npm run dev:hosted`. For browser OAuth against localhost without editing the main `.env`, see **`npm run dev:hosted:oauth-local`** and `.env.oauth.local.example`.

**Backend + frontend together:**

```bash
npm run dev:all
```

This starts the hosted backend on `http://127.0.0.1:3010` and the Next.js app on `http://127.0.0.1:3001`, with local unauthenticated hosted access enabled for manual development.

**Built server:**

```bash
npm run build
npm run start:http
```

**Worker (long jobs):**

```bash
set REDIS_URL=redis://localhost:6379
npm run build
npm run start:worker
```

**BullMQ dashboard:**

```bash
set REDIS_URL=redis://localhost:6379
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=change-me
npm run build
npm run start:admin
```

Protected hosted mode is the default. For local-only manual testing without OAuth, set **`ALLOW_UNAUTHENTICATED_HOSTED_DEV=true`** (never in production).

## API and auth

See **[docs/API.md](docs/API.md)** for headers, error shapes, and route tables. On a running instance, open **`/docs/api`** in a browser.

## Companion MCP stdio package

To run **`youtube-video-analyzer-mcp`** locally or register it in an MCP client, use the **[youtube-video-analyzer-mcp-server](https://github.com/ludmila-omlopes/youtube-video-analyzer-mcp-server)** repository:

```bash
npx -y @ludylops/youtube-video-analyzer-mcp
```

That separate package owns `stdio` transport, MCP tool registration, and `server.json` for the MCP Registry.

## Deploying on Render

The repo includes a **`render.yaml`** Blueprint (web service, worker, Redis/Key Value, admin). Typical settings:

- **Build:** `npm ci && npm run build`
- **Web start:** `npm run start:http`
- **Worker start:** `npm run start:worker`
- **Health check:** `GET /healthz`
- **Secrets:** `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, OAuth issuer/audience/JWKS, browser OAuth client URLs, Redis, admin basic-auth for the dashboard

The web service serves the landing page, dashboard, API, and docs; long analysis is executed on the worker.

## BullMQ dashboard

- Route: **`/admin/queues`** (read-focused by default)
- Auth: HTTP basic auth (`ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- Optional account admin JSON routes under `/admin/api/...` (see [docs/API.md](docs/API.md))

## Hosted launch checklist

Use **[HOSTED_LAUNCH_CHECKLIST.md](./HOSTED_LAUNCH_CHECKLIST.md)** for production smoke checks (health, OAuth sign-in, REST routes, long jobs, admin).

## Scripts and tests

- **`npm run test`** — build then run unit tests
- **`npm run release:check`** — tests plus `npm pack --dry-run` (run before publishing if this package is still published from this repo)

## Notes

- **`OAUTH_AUDIENCE`** / **`OAUTH_WEB_*`** should match the **HTTPS origin** of this deployment (for example `https://your-service.onrender.com/`), not a removed subpath.
- Cloud-style runtimes default to strict Redis-backed durability when `HOSTED_RUNTIME_ROLE` or `CLOUD_DURABILITY_MODE=require_redis` is set.

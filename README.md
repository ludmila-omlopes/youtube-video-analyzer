# YouTube Video Analyzer MCP

An MCP server for analyzing public YouTube videos with Google Gemini. The package keeps its local `stdio` npm entrypoint for registry and desktop-client usage, and also includes a Streamable HTTP surface for hosted deployments. Local `stdio` usage is the free BYOK path; hosted HTTP is intended for authenticated deployments. In this repo, Render is the primary production path and Vercel stays as an optional thin adapter.

## Features

- `analyze_youtube_video` for direct short-video or manual-clip analysis
- `analyze_youtube_video_audio` for audio-only, transcript-grounded analysis of a public YouTube video
- `analyze_long_youtube_video` for local `stdio` long videos with Files API-first handling and URL-chunk fallback
- `continue_long_video_analysis` for local `stdio` follow-up questions on a long-video `sessionId`
- `start_long_youtube_video_analysis` and `get_long_youtube_video_analysis_job` for remote-safe async long analysis over HTTP
- `get_youtube_video_metadata` for normalized public YouTube video metadata via the YouTube Data API
- Automatic YouTube URL normalization for `watch`, `live`, `shorts`, `embed`, and `youtu.be` links
- Structured JSON output in the video's detected dominant language by default
- MCP-native `structuredContent` responses with JSON text preserved in `content` for compatibility
- Structured stderr logging with request correlation IDs for long-running tool diagnostics
- Safe MCP error payloads with machine-readable `code`, `stage`, and strategy metadata
- Optional custom JSON schema support for final outputs
- Shared transport-neutral analysis service used by both `stdio` and HTTP adapters
- Hosted remote MCP endpoint at `/api/mcp`



## Prerequisites

- Node.js 20+
- A Gemini API key
- A YouTube Data API key for the metadata tool
- A public YouTube video URL
- `yt-dlp` installed locally for the long-video tool, either as a binary or via `python -m yt_dlp`
- `ffmpeg` if your `yt-dlp` setup needs it to merge adaptive video/audio downloads

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and add your API key:

   ```bash
   copy .env.example .env
   ```

3. Optionally point to a custom `yt-dlp` binary if it is not on your `PATH`.

4. Build the server:

   ```bash
   npm run build
   ```

## Running locally

For normal local development:

```bash
npm run dev
```

For the built package entrypoint behavior:

```bash
npm run build
npm start
```

For the local hosted HTTP adapter:

```bash
npm run dev:hosted
```

`npm run dev:hosted` now starts in protected hosted mode by default. To open it locally without OAuth for manual development only, set `ALLOW_UNAUTHENTICATED_HOSTED_DEV=true` in your shell or local `.env`.

For the built hosted HTTP adapter:

```bash
npm run build
npm run start:http
```

For the remote long-analysis worker:

```bash
set REDIS_URL=redis://localhost:6379
npm run build
npm run start:worker
```

For the BullMQ dashboard:

```bash
set REDIS_URL=redis://localhost:6379
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=change-me
npm run build
npm run start:admin
```

## Remote MCP over HTTP

The repository includes a hosted remote MCP entrypoint for web-standard Streamable HTTP:

- `api/mcp.ts`: optional Vercel adapter
- `src/http/mcp.ts`: shared HTTP handler
- `npm run start:http` / `render.yaml`: primary hosted runtime path

The HTTP adapter reuses the same MCP tool registration logic from `src/server.ts`.

Render is the canonical deployment target in this repository because it matches the full runtime shape: hosted HTTP endpoint, background worker, Redis-backed jobs, and the admin dashboard. Keep the Vercel-specific files only if you still want a stateless adapter or preview surface.

Hosted HTTP auth is protected by default. Production-style deployments should set `OAUTH_ENABLED=true` with the required `OAUTH_*` values. For local hosted development only, you can set `ALLOW_UNAUTHENTICATED_HOSTED_DEV=true` to bypass hosted auth intentionally.

Remote deployment environment variables:

- `GEMINI_API_KEY`
- `YOUTUBE_API_KEY`
- `ALLOW_UNAUTHENTICATED_HOSTED_DEV` (optional local-dev escape hatch only; default protected mode)
- `HOSTED_RUNTIME_ROLE` (optional explicit hosted-role marker such as `web`, `worker`, or `admin`; cloud deployments default to Redis-required durability when this or common platform markers are present)
- `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` for remote async long-video jobs
- `SESSION_STORE_DRIVER` (optional: `memory` or `redis`) for remote follow-up session persistence
- `OAUTH_ENABLED=true` for protected hosted MCP and web access
- `OAUTH_ISSUER`
- `OAUTH_AUDIENCE`
- `OAUTH_JWKS_URL`
- `OAUTH_REQUIRED_SCOPE` (optional)
- `OAUTH_WEB_CLIENT_ID` for hosted web sign-in in `/app`
- `OAUTH_WEB_AUTHORIZATION_URL`
- `OAUTH_WEB_TOKEN_URL`
- `OAUTH_WEB_REDIRECT_PATH` (optional, default `/app`)
- `OAUTH_WEB_SCOPES` (optional, defaults to `OAUTH_REQUIRED_SCOPE`)
- `OAUTH_WEB_AUDIENCE` (optional)
- `OAUTH_WEB_RESOURCE` (optional)
- `REMOTE_ACCOUNT_INITIAL_CREDITS` (optional, default `100`) initial balance for new authenticated remote accounts

Remote runtime behavior:

- remote Gemini calls use the server-owned `GEMINI_API_KEY`
- remote metadata calls use the server-owned `YOUTUBE_API_KEY`
- hosted MCP and web routes return a configuration error until you either configure OAuth or explicitly opt into `ALLOW_UNAUTHENTICATED_HOSTED_DEV=true` for local development
- when OAuth is configured, hosted MCP accepts bearer access tokens and hosted API keys
- unauthenticated MCP requests return `401` / `403` with `WWW-Authenticate` and a protected-resource metadata URL for MCP clients
- the protected-resource metadata document is served at `/.well-known/oauth-protected-resource`
- the web app shell lives at `/app` and exposes `/api/web/session`, `/api/web/runs`, `/api/web/monetization-scan`, and `/api/web/api-keys`
- the hosted REST API lives under `/api/v1` and uses the same bearer-token / API-key auth model as hosted MCP
- cloud-style hosted runtimes default to `CLOUD_DURABILITY_MODE=require_redis`, so remote accounts, API keys, usage events, workflow runs, and session persistence fail fast if Redis is missing
- hosted runtime entrypoints validate launch configuration on boot, so missing Redis, OAuth, or admin secrets stop the service before it starts handling traffic
- browser OAuth sign-in in `/app` uses Authorization Code + PKCE when the `OAUTH_WEB_*` variables are configured
- authenticated users can create and revoke API keys for hosted programmatic access, including remote MCP clients and hosted REST API callers
- remote HTTP exposes `start_long_youtube_video_analysis` and `get_long_youtube_video_analysis_job`
- remote long-video analysis runs in a BullMQ worker backed by Redis instead of blocking the MCP request
- remote follow-up session state uses Redis automatically when Redis is configured, or `SESSION_STORE_DRIVER=redis` can force it
- remote workers force `strategy: "url_chunks"` to avoid download/upload work in the HTTP runtime
- blocking `analyze_long_youtube_video` and `continue_long_video_analysis` are reserved for local `stdio` / MCP-task clients
- local `stdio` usage still uses environment variables and local config only
- hosted short/audio runs reserve credits before execution and settle on success/failure, and hosted long jobs do the same across queue execution

Important limitation for hosted HTTP deployments:

- remote long-video analysis returns a `jobId`, not a `sessionId`
- clients must poll `get_long_youtube_video_analysis_job` until the job reaches `completed` or `failed`
- local uploaded-file follow-up sessions still use `sessionId`

## Hosted REST API

The hosted HTTP service now exposes a stable REST surface alongside MCP and the web app.

Authentication:

- use the same bearer tokens as hosted MCP, or the same hosted API keys created from `/app`
- pass API keys as `Authorization: ApiKey <key>` or `x-api-key: <key>`

Current endpoints:

- `POST /api/v1/metadata`
- `POST /api/v1/analyze/short`
- `POST /api/v1/analyze/audio`
- `POST /api/v1/long-jobs`
- `GET /api/v1/long-jobs/:jobId`

Response shape:

- success: `{ "requestId": "...", "result": { ... }, "account": { ... } }`
- error: `{ "requestId": "...", "error": { ... }, "account": { ... } }`

Notes:

- metadata reads are authenticated but do not debit credits
- short/audio calls debit credits through the same hosted ledger used by remote MCP and web workflows
- long-job creation returns `202 Accepted` and reserves credits immediately
- long-job status returns `404` when the job is not visible to the authenticated account

## Deploying on Render

The repository includes a `render.yaml` Blueprint for a four-service Render setup:

- a web service for the hosted MCP HTTP endpoint
- a background worker for long-video analysis jobs
- a Key Value instance for BullMQ / Redis job state
- a BullMQ dashboard web service for queue inspection

What it configures:

- build command: `npm ci && npm run build`
- start command: `npm run start:http`
- worker start command: `npm run start:worker`
- dashboard start command: `npm run start:admin`
- health check path: `/healthz`
- required web secrets: `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_URL`, `OAUTH_WEB_CLIENT_ID`, `OAUTH_WEB_AUTHORIZATION_URL`, `OAUTH_WEB_TOKEN_URL`
- shared `CLOUD_DURABILITY_MODE=require_redis` across the web, worker, and admin services
- shared `REDIS_HOST` / `REDIS_PORT` on the web service and worker from the Render Key Value instance
- shared `REDIS_URL` on the dashboard service from the Render Key Value instance
- `HOSTED_RUNTIME_ROLE=web|worker|admin` across the three runtime services so hosted durability defaults stay strict even without an explicit `CLOUD_DURABILITY_MODE`
- dashboard secrets: `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- Key Value `maxmemoryPolicy: noeviction` for queue safety

Render-specific runtime behavior in this repo:

- the hosted HTTP server binds to `0.0.0.0:$PORT` when Render injects `PORT`
- the root route serves the platform landing page while keeping `/api/mcp` as the hosted endpoint
- the web service responds quickly for remote long analysis by enqueueing Redis jobs
- the worker processes queued long-video jobs off the request path
- the dashboard exposes BullMQ queue state at `/admin/queues` with HTTP basic auth
- remote long-video jobs still force `strategy: "url_chunks"` in cloud mode, so Render does not need local `yt-dlp` or `ffmpeg` for the public web service path

Recommended plan choice:

- the sample Blueprint uses `starter` plans because Render background workers are not available on `free`
- use the same region for the web service, worker, and Key Value instance
- on existing Blueprint-managed services, add `ADMIN_USERNAME` and `ADMIN_PASSWORD` manually in Render because `sync: false` secrets are only prompted during initial Blueprint creation

## Hosted Launch Checklist

For the product-release path, use [HOSTED_LAUNCH_CHECKLIST.md](./HOSTED_LAUNCH_CHECKLIST.md).

This is the recommended sequence:

- deploy the Render Blueprint
- configure OAuth and Redis-backed durability
- complete the web, API, MCP, worker, and admin smoke checks
- launch the hosted beta without requiring an npm publish

## BullMQ Dashboard

The repository includes a separate BullMQ dashboard service built with `bull-board`.

Behavior:

- route: `/admin/queues`
- auth: HTTP basic auth using `ADMIN_USERNAME` and `ADMIN_PASSWORD`
- mode: read-only by default through `BULL_BOARD_READ_ONLY=true`
- queues: defaults to `LONG_ANALYSIS_JOB_QUEUE_NAME`, or use `BULL_BOARD_QUEUE_NAMES` with a comma-separated list
- account admin API:
  - `GET /admin/api/account?accountId=...` or `?issuer=...&subject=...`
  - `POST /admin/api/account/plan` with JSON `{ "accountId": "...", "plan": "builder" }`
  - `POST /admin/api/account/grant-credits` with JSON `{ "accountId": "...", "credits": 100 }`

This dashboard is separate from the MCP endpoint on purpose:

- it avoids mixing admin UI traffic into the hosted MCP route
- it can connect directly to the same Redis instance as the worker
- it shows BullMQ jobs, which are not the same thing as Render's own Jobs UI

## Using the npm package

Run it without installing globally:

```bash
npx -y @ludylops/youtube-video-analyzer-mcp
```

Or install it globally:

```bash
npm install -g @ludylops/youtube-video-analyzer-mcp
youtube-video-analyzer-mcp
```

To save your API key and optional defaults in a user config file:

```bash
youtube-video-analyzer-mcp setup
```

The setup command writes a config file in the standard user config location:

- Windows: `%APPDATA%/youtube-video-analyzer-mcp/config.json`
- macOS/Linux: `~/.config/youtube-video-analyzer-mcp/config.json`

Config precedence is:

1. Explicit environment variables
2. Local `.env`
3. User config file created by `setup`
4. Built-in defaults

## MCP configuration example

### Local `stdio`

Replace the example path below with the absolute path to your own built `dist/index.js` file.

```json
{
  "mcpServers": {
    "youtube-analyzer": {
      "command": "npx",
      "args": ["-y", "@ludylops/youtube-video-analyzer-mcp"],
      "env": {
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "YOUTUBE_API_KEY": "your_youtube_api_key_here",
        "GEMINI_MODEL": "gemini-2.5-pro",
        "YT_DLP_PATH": "yt-dlp"
      }
    }
  }
}
```

### Hosted remote HTTP

```json
{
  "mcpServers": {
    "youtube-analyzer-remote": {
      "url": "https://your-deployment.example.com/api/mcp"
    }
  }
}
```

If you prefer a locally built checkout instead of npm, use `node` plus the absolute path to your own built `dist/index.js`.

## Tool behavior

### `analyze_youtube_video`

Inputs:

- `youtubeUrl`: public YouTube URL in `watch`, `live`, `shorts`, `embed`, or `youtu.be` form
- `analysisPrompt`: optional analysis focus
- `startOffsetSeconds`: optional clip start
- `endOffsetSeconds`: optional clip end
- `model`: optional Gemini model override
- `responseSchemaJson`: optional JSON schema string for custom structured output

Success output:

- `content[0].text`: pretty-printed JSON for compatibility with text-only clients
- `structuredContent`: the same parsed object validated against the tool output schema

### `analyze_youtube_video_audio`

Inputs:

- `youtubeUrl`: public YouTube URL in `watch`, `live`, `shorts`, `embed`, or `youtu.be` form
- `analysisPrompt`: optional analysis focus
- `startOffsetSeconds`: optional clip start
- `endOffsetSeconds`: optional clip end
- `model`: optional Gemini model override, default `gemini-3-flash-preview`
- `responseSchemaJson`: optional JSON schema string for custom structured output

Behavior:

- Uses Gemini's audio-understanding prompting pattern against the public YouTube URL
- Instructs Gemini to ignore visual-only evidence and analyze only spoken content, audible cues, and short transcript excerpts
- Returns structured JSON with transcript-grounded analysis by default

Success output:

- `content[0].text`: pretty-printed JSON for compatibility with text-only clients
- `structuredContent`: the same parsed object validated against the tool output schema

### `get_youtube_video_metadata`

Inputs:

- `youtubeUrl`: public YouTube URL in `watch`, `live`, `shorts`, `embed`, or `youtu.be` form

Behavior:

- Uses the YouTube Data API `videos.list` endpoint, not Gemini
- Normalizes supported URLs to a canonical `https://www.youtube.com/watch?v=...` URL
- Requires `YOUTUBE_API_KEY` in the runtime environment or local user config
- Returns normalized metadata fields with `null` or empty arrays for missing public fields

Success output:

- `content[0].text`: pretty-printed JSON for compatibility with text-only clients
- `structuredContent`: normalized public video metadata validated against the tool output schema

### `analyze_long_youtube_video`

Inputs:

- `youtubeUrl`: public YouTube URL
- `analysisPrompt`: optional global analysis focus
- `chunkModel`: optional chunk-analysis model, default `gemini-2.5-flash`
- `finalModel`: optional final synthesis model, default `gemini-2.5-pro`
- `strategy`: optional `auto`, `url_chunks`, or `uploaded_file`
- `preferCache`: optional boolean, default `true`
- `responseSchemaJson`: optional JSON schema string for the final structured output

Strategy policy:

- `auto`: prefers uploaded-file analysis first, then falls back to URL chunks if needed
- `uploaded_file`: deterministic Files API path for long videos
- `url_chunks`: explicit preview-oriented path for public YouTube videos that avoids local download/upload work
- public remote HTTP workers: force `url_chunks` regardless of the requested strategy

Behavior:

- Uses `yt-dlp` to resolve duration metadata for long videos when available, with a watch-page fallback for public videos in cloud-style runtimes
- In local `stdio`, `auto` prefers uploaded-file analysis before trying direct URL chunks
- In public remote HTTP, use `start_long_youtube_video_analysis` plus `get_long_youtube_video_analysis_job` instead of calling this tool directly
- Returns a `sessionId` when an uploaded-file session is created successfully
- Emits structured stderr logs for strategy choice, chunk progress, retries, fallbacks, and failures
- Returns `structuredContent` on success and `isError: true` on handled runtime failures

### `start_long_youtube_video_analysis`

Inputs:

- same input fields as `analyze_long_youtube_video`

Behavior:

- Enqueues a BullMQ long-analysis job in Redis and returns immediately with a `jobId`
- Intended for remote HTTP clients such as Claude that cannot wait for long-running tool calls
- The background worker runs the existing long-video analysis service and stores the final result in BullMQ job state

Success output:

- `jobId`: durable queue identifier
- `status`: always `queued`
- `pollTool`: always `get_long_youtube_video_analysis_job`
- `estimatedNextPollSeconds`: suggested polling interval

### `get_long_youtube_video_analysis_job`

Inputs:

- `jobId`: job identifier returned by `start_long_youtube_video_analysis`

Behavior:

- Polls BullMQ / Redis state for the queued long-analysis job
- Returns `queued`, `running`, `completed`, `failed`, `cancelled`, or `not_found`
- Includes the final long-analysis structured result when the job is complete

### `continue_long_video_analysis`

Inputs:

- `sessionId`: session returned by `analyze_long_youtube_video`
- `analysisPrompt`: follow-up prompt
- `model`: optional model override
- `responseSchemaJson`: optional JSON schema string for structured follow-up output

Behavior:

- Local `stdio` / MCP-task follow-up tool only
- When possible, this tool reuses the cached uploaded asset created by `analyze_long_youtube_video` instead of re-downloading the video.

## Notes

- The server uses the current MCP `registerTool(...)` API and supports both local `stdio` and remote Streamable HTTP adapters.
- The server normalizes supported YouTube URL formats into a canonical `https://www.youtube.com/watch?v=...` URL before sending the request to Gemini.
- `get_youtube_video_metadata` uses the YouTube Data API and does not call Gemini.
- If `YT_DLP_PATH` is not set, the server will try `python -m yt_dlp` automatically.
- Remote async long-analysis jobs require `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` plus a running worker process.
- The BullMQ dashboard requires `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and Redis connection settings.
- Cache reuse is an optimization for repeated analysis on the same uploaded asset; it does not increase the effective model context window.
- Local `stdio` sessions use an in-memory store by default.
- Public HTTP deployments keep `/api/mcp` protected by hosted auth, and use Redis-backed BullMQ jobs for remote long analysis when Redis connection settings are configured.




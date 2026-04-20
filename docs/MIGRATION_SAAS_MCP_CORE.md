# Migration map: SaaS repo + private `@ludylops/video-analysis-core` + MCP repo

**Status:** Analysis engine and shared `lib` live in `packages/video-analysis-core` (npm workspace). Root `npm run build` runs `build:core` first. App code imports `@ludylops/video-analysis-core`.

This document maps **today’s** paths under `src/` to three destinations:

1. **Private npm package** `@ludylops/video-analysis-core` (publish to GitHub Packages, npm private org, or Verdaccio).
2. **New MCP repository** — publishable `@ludylops/youtube-video-analyzer-mcp` (stdio only).
3. **This repository (SaaS)** — web product, workers, billing; **no** MCP HTTP/API-as-product.

Adjust the scope name `@ludylops` if your registry uses another.

---

## 1. Package `@ludylops/video-analysis-core`

### 1.1 Move wholesale (then fix imports to package-internal paths)

| Current path | Notes |
|--------------|--------|
| `src/youtube-core/**` | Entire folder: analysis, chunk planner, provider, schemas barrel, session-store interface, types barrel, video-analysis-service, youtube, youtube-metadata. |

### 1.2 Move from `src/lib/` (analysis + Gemini + shared diagnostics)

| Current path | Notes |
|--------------|--------|
| `src/lib/constants.ts` | Used by analysis, yt-dlp, Gemini, timeouts. Includes `SERVER_INFO`, `DEFAULT_TASK_TTL_MS`, queue name constants (SaaS worker still needs those strings — re-export or import from core). |
| `src/lib/errors.ts` | `DiagnosticError`, `asDiagnosticError`, etc. Used by SaaS (`api.ts`, `web-app.ts`, auth-billing) **and** core — **belongs in core**; SaaS imports from package. |
| `src/lib/gemini.ts` | Provider integration. |
| `src/lib/json-schema.ts` | Structured output validation (`ajv` / `ajv-formats`). |
| `src/lib/logger.ts` | Request-scoped logging used by analysis stack. |
| `src/lib/schemas.ts` | Zod + JSON schemas for tools (depends on `normalizeYouTubeUrl` from youtube-core youtube module — keep import internal to package). |
| `src/lib/types.ts` | Shared analysis/YT types; `youtube-core/types.ts` re-exports it today. |
| `src/lib/youtube.ts` | Today re-exports `youtube-core/youtube.js`; in core you can **delete the shim** and import `youtube-core/youtube` directly from `schemas.ts`. |

### 1.3 Do **not** put in core (SaaS-only `src/lib/`)

| Current path | Stays in SaaS |
|--------------|----------------|
| `src/lib/auth/**` | OAuth, principals, protected-resource metadata, token validation. |
| `src/lib/load-dotenv.ts` | Hosted app bootstrap (optional: SaaS-only or small `dotenv` helper in each deployable). |
| `src/lib/analysis.ts` | Re-export shim → replace callers with `@ludylops/video-analysis-core`. |
| `src/lib/chunk-planner.ts` | Re-export shim → same. |
| `src/lib/youtube-metadata.ts` | Re-export shim → same. |
| `src/lib/task-store.ts` | Re-export of **MCP** `ManagedTaskStore` → lives in **MCP repo** only. |

### 1.4 Split from `src/platform-runtime/` (factory + in-memory session)

| Current path | Action |
|--------------|--------|
| `src/platform-runtime/session-store.ts` | **Move to core** (`InMemoryAnalysisSessionStore` has no Redis). |
| `src/platform-runtime/create-service.ts` | **Split**: keep in core only **`createVideoAnalysisService`** (local defaults: in-memory session, `runtimeMode: "local"`). **Remove** `createCloudVideoAnalysisService` from core (see below). |
| `src/platform-runtime/long-analysis-jobs.ts` | **Move the `LongAnalysisJobs` interface only** into core (e.g. `core/long-analysis-jobs-types.ts`) — it only references youtube-core schema types. BullMQ implementation stays SaaS. |

**After split, SaaS adds** (same repo, `src/platform-runtime/` or `src/app/`):

- `createCloudVideoAnalysisService` — `new VideoAnalysisService({ ai, sessionStore: createCloudSessionStore(), runtimeMode: "cloud" })` importing `VideoAnalysisService` + `createDefaultAiClient` from `@ludylops/video-analysis-core` and `createCloudSessionStore` from local `cloud-session-store.ts`.
- `create-public-remote-service.ts` — same pattern: import service class + AI factory from **core**, cloud session from **SaaS**.

### 1.5 Core package: suggested `package.json` dependencies

- `dependencies`: `@google/genai`, `ajv`, `ajv-formats`, `zod` (match current usage).
- `devDependencies`: `@types/node`, `typescript`.
- No `@modelcontextprotocol/sdk`, `express`, `ioredis`, `bullmq`, `jose` in core.

### 1.6 Tests to run **inside** the core package

| Current test file | Rationale |
|-------------------|-----------|
| `src/test/youtube.test.ts` | yt-dlp / file selection |
| `src/test/youtube-metadata.test.ts` | metadata |
| `src/test/chunk-planner.test.ts` | planning |
| `src/test/gemini-language-prompts.test.ts` | prompts |
| `src/test/gemini-structured-output.test.ts` | JSON / schema |
| `src/test/gemini-video-parts.test.ts` | media parts |
| `src/test/video-analysis-service.test.ts` | service unit behavior |

Copy `src/test/test-helpers.ts` only if those tests need it.

---

## 2. New MCP repository (`@ludylops/youtube-video-analyzer-mcp`)

### 2.1 Move / keep MCP-only sources

| Current path | Notes |
|--------------|--------|
| `src/index.ts` | Stdio entry. |
| `src/mcp-server-main.ts` | `StdioServerTransport`. |
| `src/server.ts` | MCP tool registration; depends on `@ludylops/video-analysis-core` + `@modelcontextprotocol/sdk`. |
| `src/platform-runtime/task-store.ts` | `ManagedTaskStore` — **only** MCP + SDK; keep here, **not** in core. |
| `bin/youtube-video-analyzer-mcp.js` | Update imports to `../dist/index.js` or core’s published paths; keep `setup` UX. |
| `server.json` | MCP Registry metadata. |

### 2.2 MCP `package.json`

- `dependencies`: `@ludylops/video-analysis-core`, `@modelcontextprotocol/sdk`, `dotenv` (as today for `mcp-server-main` / bin).
- `files`: `bin`, `dist`, `server.json`, README, `.env.example` (trim to MCP env only).

### 2.3 MCP tests (move to MCP repo)

| Current test file |
|-------------------|
| `src/test/server-short-tool.test.ts` |
| `src/test/server-long-tool.test.ts` |
| `src/test/server-async-long-tool.test.ts` |
| `src/test/server-follow-up-tool.test.ts` |
| `src/test/server-metadata-tool.test.ts` |
| `src/test/server-audio-tool.test.ts` |
| `src/test/task-store.test.ts` |

### 2.4 MCP repo: optional env / behavior

- Stdio MCP typically uses **`runtimeMode: "local"`** and **task tools** for long video (see `createServer` in `server.ts`: cloud + `longAnalysisJobs` enables async job tools).
- If you ever want hosted MCP again, that belongs in MCP repo behind explicit config — not in SaaS.

---

## 3. This repository (SaaS only)

### 3.1 Keep (repoint imports to `@ludylops/video-analysis-core`)

**HTTP / product**

- `src/http/**` except delete MCP-specific routes and handlers (see §3.3).
- `src/hosted-dev-main.ts`, `src/dev/hosted.ts` (or replace with Next.js later).

**Platform & billing**

- `src/platform-runtime/**` **minus** files moved to core (§1.4) — keep `cloud-session-store.ts`, `bullmq-long-analysis-jobs.ts`, `durability-policy.ts`, `jobs.ts`, `launch-config.ts`, `sessions.ts` barrel (re-export cloud + in-memory only if needed), `tasks.ts`, `workflow-run-store.ts`, `create-public-remote-service.ts` (rewritten), `create-service.ts` (SaaS-only cloud helpers), `index.ts` (trim exports).

**App layer**

- `src/app/**` — update re-exports: `video-analysis-service.ts` today re-exports youtube-core → re-export from **core** or delete shim and import core everywhere.

**Auth / billing**

- `src/auth-billing/**` — change imports: `DiagnosticError` / tool types / schemas from **core**; `youtube-core/*` paths → `@ludylops/video-analysis-core`.

**Workflow**

- `src/workflow-packs/monetization-scan.ts` — import types/service from **core**.

**Other**

- `src/admin*.ts`, `src/worker*.ts`, `src/lib/auth/**`, `src/lib/load-dotenv.ts` (if kept).
- `api/`, `vercel.json`, `render.yaml` — adjust after removing MCP routes.

### 3.2 `src/lib/` after migration

- Remove moved files (§1.2) from SaaS tree; keep `auth/`, `load-dotenv.ts` only.
- Optionally add a tiny `src/lib/core.ts` that re-exports `@ludylops/video-analysis-core` for fewer churn points during the refactor.

### 3.3 Delete or stop shipping (SaaS)

| Item | Action |
|------|--------|
| `src/http/mcp.ts`, `src/http/handle-protected-mcp-request.ts` | Remove when product is web-only. |
| `src/http/http-surface.ts` | Remove `/api/mcp` routing and MCP handlers; later replace stack with Next.js. |
| `api/mcp.ts` | Remove (Vercel MCP). |
| `docs/API.md` | Remove or replace with internal dev doc only; drop from npm `files` in MCP package. |
| `server.json` | Not in SaaS repo if nothing registers MCP here. |

### 3.4 SaaS tests: keep here

All of `src/test/**` **except** the lists in §1.6 and §2.3 — update imports to `@ludylops/video-analysis-core` and fix any deleted modules (`http-mcp`, `http-surface` MCP assertions, etc.).

---

## 4. Recommended order of work

1. **Create** repo `video-analysis-core` with the files in §1, `tsconfig`, tests in §1.6, publish **private** `0.1.0`.
2. **Point** this repo’s `package.json` at `"@ludylops/video-analysis-core": "0.1.0"` (registry + auth in `.npmrc`).
3. **Replace** imports in SaaS (`youtube-core/*`, moved `lib/*`, split factories) until `npm run build` + `npm run test` pass.
4. **Extract** MCP files (§2) into a **new git repo**, depend on the same core version; run MCP tests (§2.3).
5. **Remove** MCP/API surfaces from SaaS (§3.3) and delete dead code.
6. **Bump** core when analysis behavior changes; **bump** MCP when tool schema or MCP SDK wiring changes.

---

## 5. Import cheat sheet

| Today | After |
|-------|--------|
| `from "./youtube-core/...js"` | `from "@ludylops/video-analysis-core"` or subpath if you export them |
| `from "../lib/errors.js"` (analysis-related) | `from "@ludylops/video-analysis-core"` |
| `from "../lib/gemini.js"` | `from "@ludylops/video-analysis-core"` |
| `from "../youtube-core/schemas.js"` | `from "@ludylops/video-analysis-core"` |

Subpath exports (`exports` field in core `package.json`) are optional but reduce accidental deep imports.

---

## 6. Versioning note

Keep **`SERVER_INFO.version`** in core or MCP in sync with the **published MCP package** version (`server.json` / npm), not necessarily with the SaaS app version.

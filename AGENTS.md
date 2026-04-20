# AGENTS.md

## Purpose

This repository is a TypeScript ESM **hosted platform** for analyzing public YouTube videos with Google Gemini: HTTP API, web flows, workers, billing/credits, and shared core analysis logic. Keep changes small, testable, and easy to reason about. Prefer thin wiring layers, focused library modules, and deterministic unit tests.

The **MCP `stdio` server** and MCP Registry packaging live in the sibling repo **youtube-video-analyzer-mcp-server**; do not reintroduce MCP-over-HTTP or `@modelcontextprotocol/sdk` here unless the product direction changes.

## Documentation-First Areas

Before suggesting or shipping changes in the areas below, check the original documentation instead of relying on memory:

- `@google/genai`
  - YouTube/video request shapes
  - `fileData.fileUri` handling
  - `videoMetadata` clipping and FPS behavior
  - Files API upload and processing lifecycle
  - cache APIs
  - structured JSON generation requirements and model support
  - token counting limits, model capabilities, and timeout behavior
- `yt-dlp` / `ffmpeg`
  - output format assumptions
  - merged-file behavior
  - metadata fields and download flags

These surfaces evolve faster than the rest of the repo. If a change depends on provider behavior, SDK semantics, preview features, or model-specific limits, verify it against upstream docs first.

## Modularity Rules

- Keep hosted bootstrap code (for example `src/dev/hosted.ts`, `src/hosted-dev-main.ts`) focused on wiring, env, and process lifecycle — not business rules.
- Keep provider-specific Gemini logic in `packages/video-analysis-core` (`src/lib/gemini.ts` inside that package).
- Keep external-process and URL logic in `packages/video-analysis-core` (`src/youtube-core/youtube.ts` and related helpers).
- Keep schemas, types, constants, logging, and error helpers separated from orchestration.
- If a flow grows enough that `packages/video-analysis-core/src/youtube-core/analysis.ts` becomes harder to scan, split by responsibility rather than adding another large section. Good candidates are `analysis-short`, `analysis-long`, and `analysis-follow-up`.
- Prefer pure helpers for planning, normalization, parsing, and validation so they are easy to unit test without network access.
- Do not edit `dist/` by hand. Change `src/` and rebuild. `npm run build` runs `clean` first so removed sources do not leave stale compiled files in `dist/`.

## Testing Expectations

- Unit tests are required for behavior changes.
- Prefer deterministic tests with fakes/stubs over real network calls.
- Treat `scripts/*.mjs` as manual smoke helpers only, because they may require real credentials, real downloads, or paid API usage.
- Run `npm run test` after meaningful changes. If a change affects build output or module boundaries, also ensure `npm run build` still passes.
- Before handing off a releasable npm change from **this** repo, run `npm run release:check` so version state, tests, and `npm pack --dry-run` are verified together.

## Change Guidelines

- Preserve structured stderr logging and machine-readable error payloads for API responses where applicable.
- Keep cancellation and timeout handling intact for long-running work (workers, HTTP timeouts).
- Validate model output against schema locally; do not trust provider output blindly.
- When adding a new HTTP route or strategy, define its schema, handler, error shape, and tests together.
- When preparing a releasable change, bump the npm package version in `package.json` before handing off or publishing.
- Prefer explicit names and small functions over clever abstractions.
- Avoid mixing unrelated concerns in one file just because they share the same request flow.

## Safe Defaults For Agents

- Assume this is a server-first codebase: avoid browser-only solutions.
- Assume real Gemini and YouTube integrations are expensive or flaky in tests: mock them.
- When changing novel provider behavior, quote or link the exact upstream doc in your work notes or PR summary.
- When unsure whether behavior is contractually guaranteed by Gemini or an HTTP client, treat it as unstable until docs confirm otherwise.

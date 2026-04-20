# Hosted HTTP API (short reference)

Base URL is your deployment origin (for example `https://your-service.example.com` or `http://127.0.0.1:3010`). All JSON responses use `Content-Type: application/json` unless noted.

On a running hosted instance, open **`GET /docs/api`** in a browser for a **rendered HTML** version of this page. Use **`GET /docs/api/raw`** for the same content as **Markdown** (`text/markdown`) for tools and scripts.

---

## Authentication

Unless `ALLOW_UNAUTHENTICATED_HOSTED_DEV=true`, protected routes require **one** of:

| Method | Header or cookie |
|--------|------------------|
| OAuth access token (JWT) | `Authorization: Bearer <token>` |
| API key | `x-api-key: <key>` or `Authorization: ApiKey <key>` |
| Browser session (after `/login`) | HttpOnly cookie `ya_session` (default name; override with `OAUTH_HOSTED_ACCESS_COOKIE`). Send `credentials: "include"` from JavaScript. |

OAuth protected resource metadata: **GET** `/.well-known/oauth-protected-resource`.

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | `{ "ok": true }` |

---

## Analysis API (`/api/v1/...`)

**POST** bodies are JSON. Extra properties are rejected (strict schemas).

### POST `/api/v1/metadata`

Normalizes and returns metadata for a public YouTube URL.

**Body**

| Field | Type | Required |
|-------|------|----------|
| `youtubeUrl` | string | yes (valid YouTube URL) |

### POST `/api/v1/analyze/short`

Structured short-form analysis (credits apply).

**Body**

| Field | Type | Required |
|-------|------|----------|
| `youtubeUrl` | string | yes |
| `analysisPrompt` | string | no |
| `startOffsetSeconds` | number | no |
| `endOffsetSeconds` | number | no |
| `model` | string | no |
| `responseSchemaJson` | string | no (custom JSON Schema string) |

### POST `/api/v1/analyze/audio`

Audio-oriented analysis; same body shape as **short** (`youtubeUrl`, optional `analysisPrompt`, offsets, `model`, `responseSchemaJson`).

### POST `/api/v1/long-jobs`

Starts an async long-video analysis job (when the worker/queue runtime is configured).

**Body**

| Field | Type | Required |
|-------|------|----------|
| `youtubeUrl` | string | yes |
| `analysisPrompt` | string | no |
| `chunkModel` | string | no |
| `finalModel` | string | no |
| `strategy` | `"auto"` \| `"url_chunks"` \| `"uploaded_file"` | no |
| `preferCache` | boolean | no |
| `responseSchemaJson` | string | no |

### GET `/api/v1/long-jobs/{jobId}`

Poll job status. `jobId` is URL-encoded in the path.

### Success and error shape (versioned API)

Success (typical):

```json
{
  "requestId": "<uuid>",
  "result": { },
  "account": {
    "accountId": "<issuer>:<subject>",
    "plan": "trial",
    "status": "active",
    "creditBalance": 42,
    "lastSeenAt": "<iso8601>"
  }
}
```

Error (typical):

```json
{
  "requestId": "<uuid>",
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "stage": "...",
    "message": "...",
    "retryable": false,
    "details": null
  },
  "account": null
}
```

**HTTP status hints**

| Status | Meaning |
|--------|---------|
| 400 | Invalid body or YouTube URL |
| 401 | Missing/invalid auth |
| 402 | `INSUFFICIENT_CREDITS` |
| 403 | Account suspended |
| 404 | Long job not found |
| 503 / 500 | Config or transient failure (`retryable` may be true) |

---

## Account & browser JSON (`/api/web/...`)

Useful for the **dashboard** and custom frontends. Prefer **`credentials: "include"`** when using cookie sessions.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/web/session` | Session, account, entitlements, recent usage events, workflow runs, API key list (metadata only). |
| GET | `/api/web/runs` | More workflow runs (up to 20, plan-filtered). |
| POST | `/api/web/monetization-scan` | Body: `{ "youtubeUrl": "...", "focus"?: "...", "startOffsetSeconds"?: number, "endOffsetSeconds"?: number }`. |
| GET | `/api/web/api-keys` | List keys (requires plan entitlement). |
| POST | `/api/web/api-keys` | Body: `{ "label"?: "..." }`. Returns `plaintextKey` once. |
| DELETE | `/api/web/api-keys?keyId=<id>` | Revoke a key. |

---

## Hosted HTML (human flows)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Marketing / landing page |
| GET | `/dashboard` | Account dashboard (credits, usage, keys) |
| GET | `/docs/api` | This API reference as readable HTML |
| GET | `/docs/api/raw` | Same document as Markdown (`text/markdown`) |
| GET | `/login` | Starts OAuth (redirect) |
| GET | `/oauth/callback` | OAuth redirect URI (or value of `OAUTH_WEB_REDIRECT_PATH`) |
| GET, POST | `/logout` | Clears session cookies |

---

## Operator admin (separate token)

Requires `ADMIN_CONSOLE_TOKEN` in server env and header:

`Authorization: Bearer <ADMIN_CONSOLE_TOKEN>`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/console` | Operator HTML console |
| GET | `/admin/api/accounts` | List accounts |
| GET | `/admin/api/account` | Query: `accountId` or `issuer` + `subject` |
| POST | `/admin/api/account/plan` | Set plan |
| POST | `/admin/api/account/grant-credits` | Grant credits |

---

## Environment pointers

- OAuth and hosted login: see repo **`.env.example`** (`OAUTH_*`, `OAUTH_WEB_*`, `OAUTH_HOSTED_*`).
- Local overlay: **`.env.oauth.local`** with `npm run dev:hosted:oauth-local`.

For request/response field details beyond this summary, follow the Zod schemas in `src/lib/schemas.ts` and handlers in `src/http/api.ts` / `src/http/web-app.ts`.

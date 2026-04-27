# apps/web — Next.js SaaS dashboard

Next.js 15 (App Router) frontend for the YouTube Video Analyzer hosted product.
Consumes the Express backend at the repo root via dev-server rewrites.

## Routes

- `/` — landing
- `/dashboard` — credit balance, recent runs, onboarding
- `/analyze` — submit a video (metadata / short / audio / long job)
- `/history` — past runs
- `/billing` — plan + credit balance
- `/login`, `/logout`, `/oauth/callback` — rewritten to the backend (OAuth broker)

## Auth model

The Express backend is the OAuth broker and owns the `ya_session` cookie.
Next.js runs on a different port but forwards `/login`, `/oauth/callback`,
and docs routes to the backend via `next.config.mjs` rewrites.

For app-originated API calls, Server Components call the backend directly and
Client Components use the local `/api/proxy/*` route handlers, which forward to
the backend while avoiding flaky dev-only proxy behavior in `next dev`.

- `middleware.ts` gates protected routes by checking the cookie
- `lib/session.ts` calls `/api/web/session` from Server Components, forwarding cookies
- `lib/api-client.browser.ts` is used by Client Components with `credentials: 'include'`
- `app/api/proxy/[...path]/route.ts` proxies browser-side `/api/web/*` and `/api/v1/*` calls to the backend

## Dev

```bash
# In repo root: start backend (port 3010)
npm run dev

# In another terminal: start Next.js (port 3001)
npm run dev -w @ludylops/web
```

Open `http://localhost:3001/`. Sign-in redirects through the backend at :3010
which sets `ya_session` on the Next.js origin via the `/oauth/callback` rewrite.
Logout returns to `/` by default so sign-out does not immediately restart OAuth.

For the easiest local startup, run both together from the repo root:

```bash
npm run dev:all
```

## Env

- `BACKEND_URL` — where to forward API rewrites (default `http://127.0.0.1:3010`)
- `OAUTH_HOSTED_ACCESS_COOKIE` — cookie name to check in middleware (default `ya_session`)

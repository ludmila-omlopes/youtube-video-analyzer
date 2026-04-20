import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { resolveAdminAccountId } from "../app/admin-account-routes.js";
import {
  createRemoteAccessStoreFromEnv,
  createUsageEventStoreFromEnv,
  getRemoteAccountEntitlements,
  isRemoteAccountPlan,
  type RemoteAccessStore,
  type RemoteAccount,
  type RemoteAccountPlan,
  type UsageEventStore,
} from "../auth-billing/index.js";

const ADMIN_CONSOLE_HTML_PATH = fileURLToPath(new URL("../../public/admin-console.html", import.meta.url));
const ADMIN_CONSOLE_FALLBACK = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Admin</title></head><body><p>Admin console unavailable.</p></body></html>`;

let adminConsoleHtmlPromise: Promise<string> | undefined;

function getAdminConsoleToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.ADMIN_CONSOLE_TOKEN?.trim();
  return raw ? raw : null;
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return out === 0;
}

function authorizeAdminRequest(request: Request): boolean {
  const token = getAdminConsoleToken();
  if (!token) {
    return false;
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) {
    return false;
  }

  return timingSafeEqualString(auth.slice(prefix.length), token);
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function adminNotConfiguredResponse(): Response {
  return createJsonResponse(
    {
      error: {
        code: "ADMIN_CONSOLE_NOT_CONFIGURED",
        message:
          "Set ADMIN_CONSOLE_TOKEN in the server environment to enable the operator console and admin APIs.",
      },
    },
    503
  );
}

function adminUnauthorizedResponse(): Response {
  return createJsonResponse(
    {
      error: {
        code: "ADMIN_UNAUTHORIZED",
        message: "Provide Authorization: Bearer <ADMIN_CONSOLE_TOKEN> for admin requests.",
      },
    },
    401
  );
}

function assertAdminOrRespond(request: Request): Response | null {
  if (!getAdminConsoleToken()) {
    return adminNotConfiguredResponse();
  }

  if (!authorizeAdminRequest(request)) {
    return adminUnauthorizedResponse();
  }

  return null;
}

function createAdminAccountResponse(account: RemoteAccount) {
  return {
    ...account,
    entitlements: getRemoteAccountEntitlements(account.plan),
  };
}

export type AdminHttpHandlerOptions = {
  remoteAccessStore?: RemoteAccessStore;
  usageEventStore?: UsageEventStore;
};

async function loadAdminConsoleHtml(): Promise<string> {
  if (!adminConsoleHtmlPromise) {
    adminConsoleHtmlPromise = readFile(ADMIN_CONSOLE_HTML_PATH, "utf8").catch(() => ADMIN_CONSOLE_FALLBACK);
  }

  return adminConsoleHtmlPromise;
}

export function createAdminConsolePageHandler() {
  return async function handleAdminConsolePageRequest(): Promise<Response> {
    return new Response(await loadAdminConsoleHtml(), {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      },
    });
  };
}

export function createAdminAccountsListHandler(options: AdminHttpHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();

  return async function handleAdminAccountsListRequest(request: Request): Promise<Response> {
    const denied = assertAdminOrRespond(request);
    if (denied) {
      return denied;
    }

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const accounts = await remoteAccessStore.listAccounts({
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return createJsonResponse({
      accounts: accounts.map(createAdminAccountResponse),
      totalReturned: accounts.length,
    });
  };
}

export function createAdminAccountGetHandler(options: AdminHttpHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();

  return async function handleAdminAccountGetRequest(request: Request): Promise<Response> {
    const denied = assertAdminOrRespond(request);
    if (denied) {
      return denied;
    }

    const url = new URL(request.url);
    const accountId = resolveAdminAccountId({
      accountId: url.searchParams.get("accountId") ?? undefined,
      issuer: url.searchParams.get("issuer") ?? undefined,
      subject: url.searchParams.get("subject") ?? undefined,
    });

    if (!accountId) {
      return createJsonResponse({ error: "Provide accountId or both issuer and subject." }, 400);
    }

    const account = await remoteAccessStore.getAccount(accountId);
    if (!account) {
      return createJsonResponse({ error: "Account not found.", accountId }, 404);
    }

    return createJsonResponse({
      account: createAdminAccountResponse(account),
    });
  };
}

function readJsonBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function createAdminAccountPlanHandler(options: AdminHttpHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const usageEventStore = options.usageEventStore ?? createUsageEventStoreFromEnv();

  return async function handleAdminAccountPlanRequest(request: Request): Promise<Response> {
    const denied = assertAdminOrRespond(request);
    if (denied) {
      return denied;
    }

    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      body = readJsonBody(raw) ?? {};
    } catch {
      return createJsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const accountId = resolveAdminAccountId(body);
    if (!accountId) {
      return createJsonResponse({ error: "Provide accountId or both issuer and subject." }, 400);
    }

    const plan = body.plan;
    if (!isRemoteAccountPlan(plan)) {
      return createJsonResponse(
        { error: 'Provide a valid plan: "trial", "builder", "pro", or "business".' },
        400
      );
    }

    const existing = await remoteAccessStore.getAccount(accountId);
    if (!existing) {
      return createJsonResponse({ error: "Account not found.", accountId }, 404);
    }

    const updated = await remoteAccessStore.setAccountPlan(accountId, plan as RemoteAccountPlan);
    if (!updated) {
      return createJsonResponse({ error: "Failed to update account plan.", accountId }, 500);
    }

    if (existing.plan !== updated.plan) {
      await usageEventStore.append({
        accountId,
        kind: "account.plan_changed",
        tool: "admin",
        creditsBalance: updated.creditBalance,
        metadata: {
          source: "admin_console_http",
          previousPlan: existing.plan,
          nextPlan: updated.plan,
        },
      });
    }

    return createJsonResponse({
      account: createAdminAccountResponse(updated),
    });
  };
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

export function createAdminAccountGrantCreditsHandler(options: AdminHttpHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const usageEventStore = options.usageEventStore ?? createUsageEventStoreFromEnv();

  return async function handleAdminAccountGrantCreditsRequest(request: Request): Promise<Response> {
    const denied = assertAdminOrRespond(request);
    if (denied) {
      return denied;
    }

    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      body = readJsonBody(raw) ?? {};
    } catch {
      return createJsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const accountId = resolveAdminAccountId(body);
    if (!accountId) {
      return createJsonResponse({ error: "Provide accountId or both issuer and subject." }, 400);
    }

    const credits = normalizePositiveInteger(body.credits);
    if (!credits) {
      return createJsonResponse({ error: "Provide credits as a positive number." }, 400);
    }

    const updated = await remoteAccessStore.grantAccountCredits(accountId, credits);
    if (!updated) {
      return createJsonResponse({ error: "Account not found.", accountId }, 404);
    }

    await usageEventStore.append({
      accountId,
      kind: "credits.granted",
      tool: "admin",
      creditsDelta: credits,
      creditsBalance: updated.creditBalance,
      metadata: {
        source: "admin_console_http",
      },
    });

    return createJsonResponse({
      account: createAdminAccountResponse(updated),
      grantedCredits: credits,
    });
  };
}

export const handleAdminConsolePageRequest = createAdminConsolePageHandler();
export const handleAdminAccountsListRequest = createAdminAccountsListHandler();
export const handleAdminAccountGetHttpRequest = createAdminAccountGetHandler();
export const handleAdminAccountPlanHttpRequest = createAdminAccountPlanHandler();
export const handleAdminAccountGrantCreditsHttpRequest = createAdminAccountGrantCreditsHandler();

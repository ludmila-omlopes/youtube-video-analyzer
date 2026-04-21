import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createApiKeyStoreFromEnv,
  createPrincipalScopedService,
  createPrincipalScopedSessionStore,
  createRemoteAccessStoreFromEnv,
  createUsageEventStoreFromEnv,
  type ApiKeyRecord,
  type ApiKeyStore,
  getOAuthProtectedResourceMetadataUrl,
  getRemoteAccountEntitlements,
  type AuthPrincipal,
  type RemoteAccountEntitlements,
  type RemoteAccountPlan,
  type RemoteAccountStatus,
  type RemoteAccessStore,
  type UsageEventStore,
} from "../auth-billing/index.js";
import {
  createCloudSessionStore,
  getWebPersistenceStatus,
  createPublicRemoteVideoAnalysisService,
  createWorkflowRunStoreFromEnv,
  type AnalysisSessionStore,
  type WorkflowRunRecord,
  type WorkflowRunStore,
} from "../platform-runtime/index.js";
import { asDiagnosticError, createRequestLogger, sanitizeErrorMessage } from "@ludylops/video-analysis-core";
import { runMonetizationScan, type MonetizationScanOutput } from "../workflow-packs/index.js";
import type { VideoAnalysisServiceLike } from "@ludylops/video-analysis-core";

import {
  authenticateWebRequest,
  resolveBrowserSigninPayload,
  type AuthenticateWebRequestOptions,
  type BrowserSigninPayload,
} from "./web-auth.js";

const WEB_APP_PATH = fileURLToPath(new URL("../../public/app.html", import.meta.url));
const WEB_APP_FALLBACK = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>YouTube Video Analyzer App</title></head><body><p>YouTube Video Analyzer App is unavailable.</p></body></html>`;

let webAppHtmlPromise: Promise<string> | undefined;

export type WebAppHandlerOptions = {
  service?: VideoAnalysisServiceLike;
  createService?: () => VideoAnalysisServiceLike | Promise<VideoAnalysisServiceLike>;
  sessionStore?: AnalysisSessionStore;
  remoteAccessStore?: RemoteAccessStore;
  usageEventStore?: UsageEventStore;
  workflowRunStore?: WorkflowRunStore;
  apiKeyStore?: ApiKeyStore;
  authenticateRequest?: (
    request: Request,
    options?: AuthenticateWebRequestOptions
  ) => ReturnType<typeof authenticateWebRequest>;
};

type WebSessionPayload = {
  auth: {
    mode: "oauth" | "local" | "api_key";
    signedIn: boolean;
    resourceName: string;
    issuer: string | null;
    requiredScope: string | null;
    protectedResourceMetadataUrl: string;
    browserSignin: BrowserSigninPayload;
  };
  account: {
    accountId: string;
    subject: string;
    issuer: string;
    plan: RemoteAccountPlan;
    status: RemoteAccountStatus;
    creditBalance: number;
    lastSeenAt: string;
    entitlements: RemoteAccountEntitlements;
  };
  endpoints: {
    appUrl: string;
    apiDocsUrl: string;
    protectedResourceMetadataUrl: string;
    apiKeys: "enabled" | "disabled";
  };
  persistence: ReturnType<typeof getWebPersistenceStatus>;
  onboarding: {
    state: "ready" | "first-run";
    nextAction: string;
    checklist: string[];
  };
  recentUsageEvents: Awaited<ReturnType<UsageEventStore["listForAccount"]>>;
  recentRuns: WorkflowRunRecord[];
  apiKeys: ApiKeyRecord[];
};

type MonetizationScanRequestBody = {
  youtubeUrl: string;
  focus?: string;
  startOffsetSeconds?: number;
  endOffsetSeconds?: number;
};

type CreateApiKeyRequestBody = {
  label?: string;
};

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function loadWebAppHtml(): Promise<string> {
  if (!webAppHtmlPromise) {
    webAppHtmlPromise = readFile(WEB_APP_PATH, "utf8").catch(() => WEB_APP_FALLBACK);
  }

  return webAppHtmlPromise;
}

function getOriginUrl(request: Request): URL {
  return new URL(request.url);
}

function getAppUrl(request: Request): string {
  const url = getOriginUrl(request);
  url.pathname = "/dashboard";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getApiDocsUrl(request: Request): string {
  const url = getOriginUrl(request);
  url.pathname = "/docs/api";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function filterByIsoTimestamp<T>(
  items: T[],
  retentionDays: number | null,
  getIsoTimestamp: (item: T) => string
): T[] {
  if (retentionDays === null) {
    return items;
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const parsed = Date.parse(getIsoTimestamp(item));
    return Number.isNaN(parsed) || parsed >= cutoff;
  });
}

function apiKeysAvailability(entitlements: RemoteAccountEntitlements): "enabled" | "disabled" {
  return entitlements.apiKeysEnabled ? "enabled" : "disabled";
}

function filterUsageEventsForHistory(
  accountPlan: RemoteAccountPlan,
  usageEvents: Awaited<ReturnType<UsageEventStore["listForAccount"]>>
): Awaited<ReturnType<UsageEventStore["listForAccount"]>> {
  return filterByIsoTimestamp(
    usageEvents,
    getRemoteAccountEntitlements(accountPlan).historyRetentionDays,
    (event) => event.occurredAt
  );
}

function filterWorkflowRunsForHistory(
  accountPlan: RemoteAccountPlan,
  runs: WorkflowRunRecord[]
): WorkflowRunRecord[] {
  return filterByIsoTimestamp(
    runs,
    getRemoteAccountEntitlements(accountPlan).historyRetentionDays,
    (run) => run.createdAt
  );
}

function createEntitlementErrorResponse(code: string, message: string, status = 403): Response {
  return createJsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    status
  );
}

function monetizationScanErrorHttpStatus(code: string): number {
  switch (code) {
    case "INVALID_YOUTUBE_URL":
      return 400;
    case "INSUFFICIENT_CREDITS":
      return 402;
    case "REMOTE_ACCOUNT_SUSPENDED":
    case "REMOTE_ACCOUNT_NOT_FOUND":
      return 403;
    default:
      return 500;
  }
}

function assertApiKeysEnabled(accountPlan: RemoteAccountPlan): Response | null {
  if (getRemoteAccountEntitlements(accountPlan).apiKeysEnabled) {
    return null;
  }

  return createEntitlementErrorResponse(
    "API_KEYS_NOT_ENABLED",
    "API keys are not enabled for this account plan."
  );
}

function buildOnboardingState(
  recentRuns: WorkflowRunRecord[],
  persistence: ReturnType<typeof getWebPersistenceStatus>
): WebSessionPayload["onboarding"] {
  if (recentRuns.length > 0) {
    const readyNextAction =
      persistence.remoteAccessStore === "memory"
        ? "Open a saved workflow run from history or analyze a new short video. This environment uses in-memory storage, so credits and history reset after a restart."
        : "Open a saved workflow run from history or analyze a new short video.";

    return {
      state: "ready",
      nextAction: readyNextAction,
      checklist: [
        "Account is active",
        "Workflow history is available",
        "Premium hosted workflows and API access are available",
      ],
    };
  }

  const firstRunNextAction =
    persistence.remoteAccessStore === "memory"
      ? "Paste a public YouTube URL and run a short video analysis from the app. This environment uses in-memory storage, so credits, onboarding, and recent runs reset after a restart unless REDIS_URL is configured."
      : "Paste a public YouTube URL and run a short video analysis from the app.";

  return {
    state: "first-run",
    nextAction: firstRunNextAction,
    checklist: [
      "Sign in or continue in local mode",
      "Paste a public YouTube URL",
      "Run short video analysis",
      ...(persistence.remoteAccessStore === "memory"
        ? ["Configure REDIS_URL for durable credits and workflow history"]
        : []),
    ],
  };
}

function getWorkflowSummary(result: MonetizationScanOutput): string | null {
  const summary = result.analysis.executiveSummary?.trim();
  return summary ? summary : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseMonetizationScanBody(value: unknown): MonetizationScanRequestBody {
  const body = asObject(value);
  if (!body) {
    throw new Error("Request body must be a JSON object.");
  }

  const youtubeUrl = typeof body.youtubeUrl === "string" ? body.youtubeUrl.trim() : "";
  if (!youtubeUrl) {
    throw new Error("youtubeUrl is required.");
  }

  const focus = typeof body.focus === "string" && body.focus.trim() ? body.focus.trim() : undefined;
  const startOffsetSeconds =
    typeof body.startOffsetSeconds === "number" && Number.isFinite(body.startOffsetSeconds)
      ? body.startOffsetSeconds
      : undefined;
  const endOffsetSeconds =
    typeof body.endOffsetSeconds === "number" && Number.isFinite(body.endOffsetSeconds)
      ? body.endOffsetSeconds
      : undefined;

  return {
    youtubeUrl,
    focus,
    startOffsetSeconds,
    endOffsetSeconds,
  };
}

function parseCreateApiKeyBody(value: unknown): CreateApiKeyRequestBody {
  const body = asObject(value);
  if (!body) {
    return {};
  }

  return {
    label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : undefined,
  };
}

async function createScopedWebService(
  principal: AuthPrincipal,
  options: WebAppHandlerOptions,
  remoteAccessStore: RemoteAccessStore,
  usageEventStore: UsageEventStore
): Promise<VideoAnalysisServiceLike> {
  if (options.service) {
    return options.service;
  }

  const baseSessionStore = options.sessionStore ?? createCloudSessionStore();
  const baseService =
    (await options.createService?.()) ??
    createPublicRemoteVideoAnalysisService({
      sessionStore: createPrincipalScopedSessionStore(baseSessionStore, principal, remoteAccessStore),
    });

  return createPrincipalScopedService(baseService, principal, remoteAccessStore, usageEventStore);
}

function toSessionPayload(
  request: Request,
  authMode: "oauth" | "local" | "api_key",
  principal: AuthPrincipal,
  account: Awaited<ReturnType<RemoteAccessStore["upsertAccount"]>>,
  recentUsageEvents: Awaited<ReturnType<UsageEventStore["listForAccount"]>>,
  recentRuns: WorkflowRunRecord[],
  apiKeys: ApiKeyRecord[],
  persistence: ReturnType<typeof getWebPersistenceStatus>,
  resourceName: string,
  requiredScope: string | null
): WebSessionPayload {
  const entitlements = getRemoteAccountEntitlements(account.plan);

  return {
    auth: {
      mode: authMode,
      signedIn: true,
      resourceName,
      issuer: authMode === "local" ? null : principal.issuer,
      requiredScope,
      protectedResourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(request),
      browserSignin: resolveBrowserSigninPayload(request),
    },
    account: {
      accountId: account.accountId,
      subject: account.subject,
      issuer: account.issuer,
      plan: account.plan,
      status: account.status,
      creditBalance: account.creditBalance,
      lastSeenAt: account.lastSeenAt,
      entitlements,
    },
    endpoints: {
      appUrl: getAppUrl(request),
      apiDocsUrl: getApiDocsUrl(request),
      protectedResourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(request),
      apiKeys: apiKeysAvailability(entitlements),
    },
    persistence,
    onboarding: buildOnboardingState(recentRuns, persistence),
    recentUsageEvents,
    recentRuns,
    apiKeys,
  };
}

export function createWebAppPageHandler() {
  return async function handleWebAppPageRequest(): Promise<Response> {
    return new Response(await loadWebAppHtml(), {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      },
    });
  };
}

export function createWebSessionHandler(options: WebAppHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const usageEventStore = options.usageEventStore ?? createUsageEventStoreFromEnv();
  const workflowRunStore = options.workflowRunStore ?? createWorkflowRunStoreFromEnv();
  const apiKeyStore = options.apiKeyStore ?? createApiKeyStoreFromEnv();

  return async function handleWebSessionRequest(request: Request): Promise<Response> {
    try {
      const auth = await (options.authenticateRequest ?? authenticateWebRequest)(request, {
        apiKeyStore,
      });
      if (!auth.ok) {
        return auth.response;
      }

      const account = await remoteAccessStore.upsertAccount(auth.principal);
      const [recentUsageEvents, recentRuns, apiKeys] = await Promise.all([
        usageEventStore.listForAccount(account.accountId),
        workflowRunStore.listRunsForAccount(account.accountId, 8),
        apiKeyStore.listApiKeys(account.accountId),
      ]);
      const persistence = getWebPersistenceStatus();
      const visibleUsageEvents = filterUsageEventsForHistory(account.plan, recentUsageEvents).slice(0, 12);
      const visibleRuns = filterWorkflowRunsForHistory(account.plan, recentRuns);

      return createJsonResponse(
        toSessionPayload(
          request,
          auth.authMode,
          auth.principal,
          account,
          visibleUsageEvents,
          visibleRuns,
          apiKeys,
          persistence,
          auth.config.resourceName,
          auth.config.enabled ? auth.config.requiredScope : null
        )
      );
    } catch (error) {
      const diagnostic = asDiagnosticError(error, {
        tool: "web_session",
        code: "WEB_SESSION_FAILED",
        stage: "unknown",
        message: sanitizeErrorMessage(error) ?? "Failed to load web session.",
      });
      return createJsonResponse(
        {
          error: {
            code: diagnostic.code,
            message: diagnostic.message,
            retryable: diagnostic.retryable,
          },
        },
        500
      );
    }
  };
}

export function createWorkflowRunsHandler(options: WebAppHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const workflowRunStore = options.workflowRunStore ?? createWorkflowRunStoreFromEnv();
  const apiKeyStore = options.apiKeyStore ?? createApiKeyStoreFromEnv();

  return async function handleWorkflowRunsRequest(request: Request): Promise<Response> {
    const auth = await (options.authenticateRequest ?? authenticateWebRequest)(request, {
      apiKeyStore,
    });
    if (!auth.ok) {
      return auth.response;
    }

    const account = await remoteAccessStore.upsertAccount(auth.principal);
    const runs = await workflowRunStore.listRunsForAccount(account.accountId, 20);
    return createJsonResponse({ runs: filterWorkflowRunsForHistory(account.plan, runs) });
  };
}

export function createApiKeysListHandler(options: WebAppHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const apiKeyStore = options.apiKeyStore ?? createApiKeyStoreFromEnv();

  return async function handleApiKeysListRequest(request: Request): Promise<Response> {
    const auth = await (options.authenticateRequest ?? authenticateWebRequest)(request, {
      apiKeyStore,
    });
    if (!auth.ok) {
      return auth.response;
    }

    const account = await remoteAccessStore.upsertAccount(auth.principal);
    const apiKeysDisabledResponse = assertApiKeysEnabled(account.plan);
    if (apiKeysDisabledResponse) {
      return apiKeysDisabledResponse;
    }

    const apiKeys = await apiKeyStore.listApiKeys(account.accountId);
    return createJsonResponse({ apiKeys });
  };
}

export function createApiKeysCreateHandler(options: WebAppHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const apiKeyStore = options.apiKeyStore ?? createApiKeyStoreFromEnv();

  return async function handleApiKeysCreateRequest(request: Request): Promise<Response> {
    const auth = await (options.authenticateRequest ?? authenticateWebRequest)(request, {
      apiKeyStore,
    });
    if (!auth.ok) {
      return auth.response;
    }

    let body: CreateApiKeyRequestBody;
    try {
      body = parseCreateApiKeyBody(await request.json());
    } catch {
      body = {};
    }

    const account = await remoteAccessStore.upsertAccount(auth.principal);
    const apiKeysDisabledResponse = assertApiKeysEnabled(account.plan);
    if (apiKeysDisabledResponse) {
      return apiKeysDisabledResponse;
    }

    const created = await apiKeyStore.createApiKey(auth.principal, body.label ?? "Programmatic key");
    return createJsonResponse(created, 201);
  };
}

export function createApiKeysRevokeHandler(options: WebAppHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const apiKeyStore = options.apiKeyStore ?? createApiKeyStoreFromEnv();

  return async function handleApiKeysRevokeRequest(request: Request): Promise<Response> {
    const auth = await (options.authenticateRequest ?? authenticateWebRequest)(request, {
      apiKeyStore,
    });
    if (!auth.ok) {
      return auth.response;
    }

    const url = new URL(request.url);
    const keyId = url.searchParams.get("keyId")?.trim() ?? "";
    if (!keyId) {
      return createJsonResponse(
        {
          error: {
            code: "API_KEY_ID_REQUIRED",
            message: "keyId query parameter is required.",
          },
        },
        400
      );
    }

    const account = await remoteAccessStore.upsertAccount(auth.principal);
    const apiKeysDisabledResponse = assertApiKeysEnabled(account.plan);
    if (apiKeysDisabledResponse) {
      return apiKeysDisabledResponse;
    }

    const revoked = await apiKeyStore.revokeApiKey(account.accountId, keyId);
    return createJsonResponse({ revoked });
  };
}

export function createMonetizationScanHandler(options: WebAppHandlerOptions = {}) {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const usageEventStore = options.usageEventStore ?? createUsageEventStoreFromEnv();
  const workflowRunStore = options.workflowRunStore ?? createWorkflowRunStoreFromEnv();
  const apiKeyStore = options.apiKeyStore ?? createApiKeyStoreFromEnv();

  return async function handleMonetizationScanRequest(request: Request): Promise<Response> {
    const auth = await (options.authenticateRequest ?? authenticateWebRequest)(request, {
      apiKeyStore,
    });
    if (!auth.ok) {
      return auth.response;
    }

    const logger = createRequestLogger("web_monetization_scan");
    let body: MonetizationScanRequestBody;
    try {
      body = parseMonetizationScanBody(await request.json());
    } catch (error) {
      return createJsonResponse(
        {
          error: {
            code: "INVALID_WEB_REQUEST",
            message: error instanceof Error ? error.message : "Invalid request body.",
          },
        },
        400
      );
    }

    const account = await remoteAccessStore.upsertAccount(auth.principal);
    const service = await createScopedWebService(auth.principal, options, remoteAccessStore, usageEventStore);

    logger.info("workflow.start", {
      workflowId: "monetization-scan",
      youtubeUrl: body.youtubeUrl,
      focus: body.focus ?? null,
      accountId: account.accountId,
    });

    try {
      const result = await runMonetizationScan(service, body, {
        logger,
        tool: "web_monetization_scan",
        abortSignal: request.signal,
      });

      const run = await workflowRunStore.appendRun({
        accountId: account.accountId,
        workflowId: result.workflowId,
        workflowLabel: result.workflowLabel,
        status: "completed",
        youtubeUrl: result.youtubeUrl,
        normalizedYoutubeUrl: result.normalizedYoutubeUrl,
        videoTitle: result.videoTitle,
        summary: getWorkflowSummary(result),
        input: {
          youtubeUrl: body.youtubeUrl,
          focus: body.focus ?? null,
          startOffsetSeconds: body.startOffsetSeconds ?? null,
          endOffsetSeconds: body.endOffsetSeconds ?? null,
        },
        output: result as unknown as Record<string, unknown>,
        error: null,
      });
      const nextAccount = (await remoteAccessStore.getAccount(account.accountId)) ?? account;

      logger.info("workflow.success", {
        workflowId: "monetization-scan",
        accountId: account.accountId,
        runId: run.runId,
        creditBalance: nextAccount.creditBalance,
      });

      return createJsonResponse({
        account: nextAccount,
        run,
      });
    } catch (error) {
      const diagnostic = asDiagnosticError(error, {
        tool: "web_monetization_scan",
        code: "WEB_MONETIZATION_SCAN_FAILED",
        stage: "unknown",
        message: "Monetization scan failed.",
      });

      logger.error("workflow.failure", {
        workflowId: "monetization-scan",
        accountId: account.accountId,
        code: diagnostic.code,
        stage: diagnostic.stage,
        message: diagnostic.message,
        retryable: diagnostic.retryable,
      });

      try {
        await workflowRunStore.appendRun({
          accountId: account.accountId,
          workflowId: "monetization-scan",
          workflowLabel: "Monetization Scan",
          status: "failed",
          youtubeUrl: body.youtubeUrl,
          normalizedYoutubeUrl: null,
          videoTitle: null,
          summary: null,
          input: {
            youtubeUrl: body.youtubeUrl,
            focus: body.focus ?? null,
            startOffsetSeconds: body.startOffsetSeconds ?? null,
            endOffsetSeconds: body.endOffsetSeconds ?? null,
          },
          output: null,
          error: {
            message: diagnostic.message,
            code: diagnostic.code,
          },
        });
      } catch {
        logger.warn("workflow.history_append_failed", {
          workflowId: "monetization-scan",
          accountId: account.accountId,
        });
      }

      return createJsonResponse(
        {
          error: {
            code: diagnostic.code,
            stage: diagnostic.stage,
            message: diagnostic.message,
            retryable: diagnostic.retryable,
            ...(diagnostic.details ? { details: diagnostic.details } : {}),
          },
        },
        monetizationScanErrorHttpStatus(diagnostic.code)
      );
    }
  };
}

export const handleWebAppPageRequest = createWebAppPageHandler();
export const handleWebSessionRequest = createWebSessionHandler();
export const handleWorkflowRunsRequest = createWorkflowRunsHandler();
export const handleMonetizationScanRequest = createMonetizationScanHandler();
export const handleApiKeysListRequest = createApiKeysListHandler();
export const handleApiKeysCreateRequest = createApiKeysCreateHandler();
export const handleApiKeysRevokeRequest = createApiKeysRevokeHandler();

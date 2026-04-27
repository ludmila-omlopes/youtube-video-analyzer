import { z } from "zod";

import {
  createPrincipalScopedLongAnalysisJobs,
  createPrincipalScopedService,
  createPrincipalScopedSessionStore,
  createRemoteAccessStoreFromEnv,
  createUsageEventStoreFromEnv,
  type AuthPrincipal,
  type RemoteAccessStore,
  type RemoteAccountPlan,
  type RemoteAccountStatus,
  type UsageEventStore,
} from "../auth-billing/index.js";
import {
  asDiagnosticError,
  audioToolInputSchema,
  createRequestLogger,
  DiagnosticError,
  longToolInputSchema,
  metadataToolInputSchema,
  shortToolInputSchema,
  type ProgressUpdate,
  type AudioToolInput,
  type LongToolInput,
  type MetadataToolInput,
  type ShortToolInput,
  type VideoAnalysisServiceLike,
} from "@ludylops/video-analysis-core";
import {
  createBullMqLongAnalysisJobsFromEnv,
  createCloudSessionStore,
  createPublicRemoteVideoAnalysisService,
  type AnalysisSessionStore,
  type LongAnalysisJobs,
} from "../platform-runtime/index.js";

import {
  authenticateWebRequest,
  type AuthenticateWebRequestOptions,
} from "./web-auth.js";

const metadataRequestSchema = z.object(metadataToolInputSchema).strict();
const shortAnalysisRequestSchema = z.object(shortToolInputSchema).strict();
const audioAnalysisRequestSchema = z.object(audioToolInputSchema).strict();
const longAnalysisJobRequestSchema = z.object(longToolInputSchema).strict();
const LONG_JOB_PATH_PREFIX = "/api/v1/long-jobs/";

export type ApiHandlerOptions = {
  service?: VideoAnalysisServiceLike;
  createService?: () => VideoAnalysisServiceLike | Promise<VideoAnalysisServiceLike>;
  longAnalysisJobs?: LongAnalysisJobs | null;
  sessionStore?: AnalysisSessionStore;
  remoteAccessStore?: RemoteAccessStore;
  usageEventStore?: UsageEventStore;
  authenticateRequest?: (
    request: Request,
    options?: AuthenticateWebRequestOptions
  ) => ReturnType<typeof authenticateWebRequest>;
};

type ApiAccountSummary = {
  accountId: string;
  plan: RemoteAccountPlan;
  status: RemoteAccountStatus;
  creditBalance: number;
  lastSeenAt: string;
};

type ApiSuccessPayload = {
  requestId: string;
  result: unknown;
  account: ApiAccountSummary;
};

type ApiErrorPayload = {
  requestId: string;
  error: {
    code: string;
    stage: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown> | null;
  };
  account: ApiAccountSummary | null;
};

type ApiProgressEvent = {
  type: "progress";
  requestId: string;
  progress: number;
  total: number | null;
  message: string;
};

type ApiResultEvent = {
  type: "result";
  payload: ApiSuccessPayload;
};

type ApiErrorEvent = {
  type: "error";
  status: number;
  payload: ApiErrorPayload;
  lastProgress: ApiProgressEvent | null;
};

type AuthenticatedApiRequest =
  | {
      ok: true;
      principal: AuthPrincipal;
      account: Awaited<ReturnType<RemoteAccessStore["upsertAccount"]>>;
    }
  | {
      ok: false;
      response: Response;
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

function summarizeAccount(
  account: Awaited<ReturnType<RemoteAccessStore["upsertAccount"]>>
): ApiAccountSummary {
  return {
    accountId: account.accountId,
    plan: account.plan,
    status: account.status,
    creditBalance: account.creditBalance,
    lastSeenAt: account.lastSeenAt,
  };
}

async function getCurrentAccountSummary(
  remoteAccessStore: RemoteAccessStore,
  fallbackAccount: Awaited<ReturnType<RemoteAccessStore["upsertAccount"]>>
): Promise<ApiAccountSummary> {
  const latest = (await remoteAccessStore.getAccount(fallbackAccount.accountId)) ?? fallbackAccount;
  return summarizeAccount(latest);
}

function createApiSuccessResponse(
  requestId: string,
  result: unknown,
  account: ApiAccountSummary,
  status = 200
): Response {
  return createJsonResponse(buildApiSuccessPayload(requestId, result, account), status);
}

function getDiagnosticStatusCode(error: DiagnosticError): number {
  switch (error.code) {
    case "INVALID_YOUTUBE_URL":
    case "INVALID_API_REQUEST":
      return 400;
    case "INSUFFICIENT_CREDITS":
      return 402;
    case "REMOTE_ACCOUNT_SUSPENDED":
      return 403;
    case "LONG_ANALYSIS_JOB_NOT_FOUND":
      return 404;
    case "REMOTE_ACCOUNT_NOT_FOUND":
      return 409;
    default:
      break;
  }

  if (error.stage === "config") {
    return 503;
  }

  return error.retryable ? 503 : 500;
}

function createApiErrorResponse(
  requestId: string,
  diagnostic: DiagnosticError,
  account?: ApiAccountSummary
): Response {
  return createJsonResponse(buildApiErrorPayload(requestId, diagnostic, account), getDiagnosticStatusCode(diagnostic));
}

function buildApiSuccessPayload(
  requestId: string,
  result: unknown,
  account: ApiAccountSummary
): ApiSuccessPayload {
  return {
    requestId,
    result,
    account,
  };
}

function buildApiErrorPayload(
  requestId: string,
  diagnostic: DiagnosticError,
  account?: ApiAccountSummary
): ApiErrorPayload {
  return {
    requestId,
    error: {
      code: diagnostic.code,
      stage: diagnostic.stage,
      message: diagnostic.message,
      retryable: diagnostic.retryable,
      details: diagnostic.details ?? null,
    },
    account: account ?? null,
  };
}

function requestWantsJsonLineStream(request: Request): boolean {
  const accept = request.headers.get("accept");
  return typeof accept === "string" && accept.includes("application/x-ndjson");
}

function createJsonLineStreamResponse(
  producer: (emit: (event: ApiProgressEvent | ApiResultEvent | ApiErrorEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (event: ApiProgressEvent | ApiResultEvent | ApiErrorEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void producer(emit)
        .catch((error) => {
          closed = true;
          controller.error(error);
        })
        .finally(() => {
          if (!closed) {
            controller.close();
          }
        });
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

function formatZodIssuePath(issue: z.ZodIssue): string {
  return issue.path.length > 0 ? issue.path.join(".") : "body";
}

function getInvalidRequestMessage(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return "Request body is invalid.";
  }

  return `${formatZodIssuePath(firstIssue)}: ${firstIssue.message}`;
}

async function parseRequestBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  tool: string,
  requestId: string
): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new DiagnosticError({
      tool,
      code: "INVALID_API_REQUEST",
      stage: "unknown",
      message: "Request body must be valid JSON.",
      retryable: false,
    });
  }

  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  throw new DiagnosticError({
    tool,
    code: "INVALID_API_REQUEST",
    stage: "unknown",
    message: getInvalidRequestMessage(parsed.error),
    retryable: false,
    details: {
      requestId,
    },
  });
}

async function authenticateApiRequest(
  request: Request,
  remoteAccessStore: RemoteAccessStore,
  options: ApiHandlerOptions
): Promise<AuthenticatedApiRequest> {
  const auth = await (options.authenticateRequest ?? authenticateWebRequest)(request);
  if (!auth.ok) {
    return {
      ok: false,
      response: auth.response,
    };
  }

  return {
    ok: true,
    principal: auth.principal,
    account: await remoteAccessStore.upsertAccount(auth.principal),
  };
}

async function createScopedApiService(
  principal: AuthPrincipal,
  options: ApiHandlerOptions,
  remoteAccessStore: RemoteAccessStore,
  usageEventStore: UsageEventStore
): Promise<VideoAnalysisServiceLike> {
  const baseService =
    options.service ??
    (await options.createService?.()) ??
    createPublicRemoteVideoAnalysisService({
      sessionStore: createPrincipalScopedSessionStore(
        options.sessionStore ?? createCloudSessionStore(),
        principal,
        remoteAccessStore
      ),
    });

  return createPrincipalScopedService(baseService, principal, remoteAccessStore, usageEventStore);
}

function createScopedApiLongAnalysisJobs(
  principal: AuthPrincipal,
  options: ApiHandlerOptions,
  remoteAccessStore: RemoteAccessStore,
  usageEventStore: UsageEventStore
): LongAnalysisJobs | null {
  const baseLongAnalysisJobs = options.longAnalysisJobs ?? createBullMqLongAnalysisJobsFromEnv();
  if (!baseLongAnalysisJobs) {
    return null;
  }

  return createPrincipalScopedLongAnalysisJobs(
    baseLongAnalysisJobs,
    principal,
    remoteAccessStore,
    usageEventStore
  );
}

function getLongJobIdFromRequest(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(LONG_JOB_PATH_PREFIX)) {
    return null;
  }

  const suffix = pathname.slice(LONG_JOB_PATH_PREFIX.length).trim();
  if (!suffix) {
    return null;
  }

  try {
    return decodeURIComponent(suffix);
  } catch {
    return suffix;
  }
}

async function withAuthenticatedApiContext<T>(
  request: Request,
  options: ApiHandlerOptions,
  run: (context: {
    principal: AuthPrincipal;
    account: Awaited<ReturnType<RemoteAccessStore["upsertAccount"]>>;
    remoteAccessStore: RemoteAccessStore;
    usageEventStore: UsageEventStore;
  }) => Promise<Response>
): Promise<Response> {
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();
  const usageEventStore = options.usageEventStore ?? createUsageEventStoreFromEnv();
  const auth = await authenticateApiRequest(request, remoteAccessStore, options);
  if (!auth.ok) {
    return auth.response;
  }

  return run({
    principal: auth.principal,
    account: auth.account,
    remoteAccessStore,
    usageEventStore,
  });
}

export function createApiMetadataHandler(options: ApiHandlerOptions = {}) {
  return async function handleApiMetadataRequest(request: Request): Promise<Response> {
    const logger = createRequestLogger("get_youtube_video_metadata");

    return withAuthenticatedApiContext(request, options, async ({ principal, account, remoteAccessStore, usageEventStore }) => {
      try {
        const input = await parseRequestBody<MetadataToolInput>(
          request,
          metadataRequestSchema,
          "get_youtube_video_metadata",
          logger.requestId
        );
        const service = await createScopedApiService(principal, options, remoteAccessStore, usageEventStore);
        const result = await service.getYouTubeMetadata(input, {
          logger,
          tool: "get_youtube_video_metadata",
          abortSignal: request.signal,
        });
        return createApiSuccessResponse(
          logger.requestId,
          result,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      } catch (error) {
        const diagnostic = asDiagnosticError(error, {
          tool: "get_youtube_video_metadata",
          code: "YOUTUBE_METADATA_FETCH_FAILED",
          stage: "metadata",
          message: "YouTube metadata fetch failed.",
        });
        return createApiErrorResponse(
          logger.requestId,
          diagnostic,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      }
    });
  };
}

export function createApiShortAnalysisHandler(options: ApiHandlerOptions = {}) {
  return async function handleApiShortAnalysisRequest(request: Request): Promise<Response> {
    const logger = createRequestLogger("analyze_youtube_video");

    if (requestWantsJsonLineStream(request)) {
      return withAuthenticatedApiContext(
        request,
        options,
        async ({ principal, account, remoteAccessStore, usageEventStore }) =>
          createJsonLineStreamResponse(async (emit) => {
            let lastProgress: ApiProgressEvent | null = null;

            const emitProgress = async (update: ProgressUpdate) => {
              lastProgress = {
                type: "progress",
                requestId: logger.requestId,
                progress: update.progress,
                total: update.total ?? null,
                message: update.message,
              };
              emit(lastProgress);
            };

            await emitProgress({
              progress: 1,
              total: 5,
              message: "Checking the YouTube link.",
            });

            try {
              const input = await parseRequestBody<ShortToolInput>(
                request,
                shortAnalysisRequestSchema,
                "analyze_youtube_video",
                logger.requestId
              );
              const service = await createScopedApiService(
                principal,
                options,
                remoteAccessStore,
                usageEventStore
              );
              const result = await service.analyzeShort(input, {
                logger,
                tool: "analyze_youtube_video",
                abortSignal: request.signal,
                reportProgress: emitProgress,
              });
              emit({
                type: "result",
                payload: buildApiSuccessPayload(
                  logger.requestId,
                  result,
                  await getCurrentAccountSummary(remoteAccessStore, account)
                ),
              });
            } catch (error) {
              const diagnostic = asDiagnosticError(error, {
                tool: "analyze_youtube_video",
                code: "SHORT_VIDEO_ANALYSIS_FAILED",
                stage: "unknown",
                message: "Short-video analysis failed.",
              });
              emit({
                type: "error",
                status: getDiagnosticStatusCode(diagnostic),
                payload: buildApiErrorPayload(
                  logger.requestId,
                  diagnostic,
                  await getCurrentAccountSummary(remoteAccessStore, account)
                ),
                lastProgress,
              });
            }
          })
      );
    }

    return withAuthenticatedApiContext(request, options, async ({ principal, account, remoteAccessStore, usageEventStore }) => {
      try {
        const input = await parseRequestBody<ShortToolInput>(
          request,
          shortAnalysisRequestSchema,
          "analyze_youtube_video",
          logger.requestId
        );
        const service = await createScopedApiService(principal, options, remoteAccessStore, usageEventStore);
        const result = await service.analyzeShort(input, {
          logger,
          tool: "analyze_youtube_video",
          abortSignal: request.signal,
        });
        return createApiSuccessResponse(
          logger.requestId,
          result,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      } catch (error) {
        const diagnostic = asDiagnosticError(error, {
          tool: "analyze_youtube_video",
          code: "SHORT_VIDEO_ANALYSIS_FAILED",
          stage: "unknown",
          message: "Short-video analysis failed.",
        });
        return createApiErrorResponse(
          logger.requestId,
          diagnostic,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      }
    });
  };
}

export function createApiAudioAnalysisHandler(options: ApiHandlerOptions = {}) {
  return async function handleApiAudioAnalysisRequest(request: Request): Promise<Response> {
    const logger = createRequestLogger("analyze_youtube_video_audio");

    return withAuthenticatedApiContext(request, options, async ({ principal, account, remoteAccessStore, usageEventStore }) => {
      try {
        const input = await parseRequestBody<AudioToolInput>(
          request,
          audioAnalysisRequestSchema,
          "analyze_youtube_video_audio",
          logger.requestId
        );
        const service = await createScopedApiService(principal, options, remoteAccessStore, usageEventStore);
        const result = await service.analyzeAudio(input, {
          logger,
          tool: "analyze_youtube_video_audio",
          abortSignal: request.signal,
        });
        return createApiSuccessResponse(
          logger.requestId,
          result,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      } catch (error) {
        const diagnostic = asDiagnosticError(error, {
          tool: "analyze_youtube_video_audio",
          code: "AUDIO_ONLY_VIDEO_ANALYSIS_FAILED",
          stage: "unknown",
          message: "Audio-only video analysis failed.",
        });
        return createApiErrorResponse(
          logger.requestId,
          diagnostic,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      }
    });
  };
}

export function createApiLongJobStartHandler(options: ApiHandlerOptions = {}) {
  return async function handleApiLongJobStartRequest(request: Request): Promise<Response> {
    const logger = createRequestLogger("start_long_youtube_video_analysis");

    return withAuthenticatedApiContext(request, options, async ({ principal, account, remoteAccessStore, usageEventStore }) => {
      try {
        const input = await parseRequestBody<LongToolInput>(
          request,
          longAnalysisJobRequestSchema,
          "start_long_youtube_video_analysis",
          logger.requestId
        );
        const longAnalysisJobs = createScopedApiLongAnalysisJobs(
          principal,
          options,
          remoteAccessStore,
          usageEventStore
        );
        if (!longAnalysisJobs) {
          throw new DiagnosticError({
            tool: "start_long_youtube_video_analysis",
            code: "LONG_ANALYSIS_NOT_AVAILABLE",
            stage: "config",
            message: "Long analysis jobs are not available in this deployment.",
            retryable: false,
          });
        }

        const result = await longAnalysisJobs.enqueueLongAnalysis(input);
        return createApiSuccessResponse(
          logger.requestId,
          result,
          await getCurrentAccountSummary(remoteAccessStore, account),
          202
        );
      } catch (error) {
        const diagnostic = asDiagnosticError(error, {
          tool: "start_long_youtube_video_analysis",
          code: "LONG_ANALYSIS_JOB_ENQUEUE_FAILED",
          stage: "unknown",
          message: "Failed to enqueue long-video analysis job.",
        });
        return createApiErrorResponse(
          logger.requestId,
          diagnostic,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      }
    });
  };
}

export function createApiLongJobStatusHandler(options: ApiHandlerOptions = {}) {
  return async function handleApiLongJobStatusRequest(request: Request): Promise<Response> {
    const logger = createRequestLogger("get_long_youtube_video_analysis_job");

    return withAuthenticatedApiContext(request, options, async ({ principal, account, remoteAccessStore, usageEventStore }) => {
      try {
        const jobId = getLongJobIdFromRequest(request);
        if (!jobId) {
          throw new DiagnosticError({
            tool: "get_long_youtube_video_analysis_job",
            code: "INVALID_API_REQUEST",
            stage: "unknown",
            message: "jobId path segment is required.",
            retryable: false,
          });
        }

        const longAnalysisJobs = createScopedApiLongAnalysisJobs(
          principal,
          options,
          remoteAccessStore,
          usageEventStore
        );
        if (!longAnalysisJobs) {
          throw new DiagnosticError({
            tool: "get_long_youtube_video_analysis_job",
            code: "LONG_ANALYSIS_NOT_AVAILABLE",
            stage: "config",
            message: "Long analysis jobs are not available in this deployment.",
            retryable: false,
          });
        }

        const result = await longAnalysisJobs.getLongAnalysisJob(jobId);
        if (result.status === "not_found") {
          throw new DiagnosticError({
            tool: "get_long_youtube_video_analysis_job",
            code: "LONG_ANALYSIS_JOB_NOT_FOUND",
            stage: "unknown",
            message: "Long analysis job was not found.",
            retryable: false,
            details: { jobId },
          });
        }

        return createApiSuccessResponse(
          logger.requestId,
          result,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      } catch (error) {
        const diagnostic = asDiagnosticError(error, {
          tool: "get_long_youtube_video_analysis_job",
          code: "LONG_ANALYSIS_JOB_LOOKUP_FAILED",
          stage: "unknown",
          message: "Failed to fetch long-video analysis job state.",
        });
        return createApiErrorResponse(
          logger.requestId,
          diagnostic,
          await getCurrentAccountSummary(remoteAccessStore, account)
        );
      }
    });
  };
}

export const handleApiMetadataRequest = createApiMetadataHandler();
export const handleApiShortAnalysisRequest = createApiShortAnalysisHandler();
export const handleApiAudioAnalysisRequest = createApiAudioAnalysisHandler();
export const handleApiLongJobStartRequest = createApiLongJobStartHandler();
export const handleApiLongJobStatusRequest = createApiLongJobStatusHandler();

export function isApiLongJobStatusPath(pathname: string): boolean {
  return pathname.startsWith(LONG_JOB_PATH_PREFIX) && pathname.length > LONG_JOB_PATH_PREFIX.length;
}

export type SessionAccount = {
  accountId: string;
  subject: string;
  issuer: string;
  plan: string;
  status: string;
  creditBalance: number;
  lastSeenAt: string;
  entitlements?: Record<string, unknown>;
};

export type SessionAuth = {
  mode: "oauth" | "local";
  resourceName?: string;
  issuer?: string;
  requiredScope?: string;
  browserSignin?: {
    enabled: boolean;
    authorizationUrl: string | null;
    clientId: string | null;
    redirectUrl: string;
    scopes: string[];
    audience: string | null;
    resource: string | null;
  };
};

export type SessionResponse = {
  auth: SessionAuth;
  account: SessionAccount | null;
  endpoints?: {
    appUrl?: string;
    apiDocsUrl?: string;
  };
  persistence?: {
    remoteAccessStore: "memory" | "redis";
    usageEventStore: "memory" | "redis";
    workflowRunStore: "memory" | "redis";
    apiKeyStore: "memory" | "redis";
    sessionStore: "memory" | "redis";
    durable: boolean;
    warning?: string | null;
  };
  onboarding?: {
    state: "ready" | "first-run";
    nextAction?: string;
    checklist?: Array<{ id: string; label: string; done: boolean }>;
  };
  recentRuns?: RunRecord[];
  recentUsageEvents?: UsageEvent[];
};

export type RunRecord = {
  runId: string;
  kind: string;
  createdAt: string;
  status: string;
  summary?: string;
  inputUrl?: string;
};

export type UsageEvent = {
  eventId: string;
  createdAt: string;
  kind: string;
  creditsSpent: number;
  metadata?: Record<string, unknown>;
};

export type AnalyzeResponse = {
  requestId: string;
  result: unknown;
  account: Pick<SessionAccount, "accountId" | "plan" | "status" | "creditBalance" | "lastSeenAt">;
};

export type LongJobResponse = {
  requestId: string;
  result: {
    jobId: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    progress?: {
      progress: number | null;
      total: number | null;
      message: string | null;
    } | null;
    result?: unknown;
    error?: { code: string; message: string } | null;
  };
  account: AnalyzeResponse["account"];
};

export type ApiErrorBody = {
  requestId?: string;
  error: {
    code: string;
    message: string;
    stage?: string;
    retryable?: boolean;
    details?: Record<string, unknown> | null;
  };
  account?: AnalyzeResponse["account"] | null;
};

export type ShortAnalysisProgressEvent = {
  type: "progress";
  requestId: string;
  progress: number;
  total: number | null;
  message: string;
};

export type ShortAnalysisResultEvent = {
  type: "result";
  payload: AnalyzeResponse;
};

export type ShortAnalysisErrorEvent = {
  type: "error";
  status: number;
  payload: ApiErrorBody;
  lastProgress: ShortAnalysisProgressEvent | null;
};

export type ShortAnalysisStreamEvent =
  | ShortAnalysisProgressEvent
  | ShortAnalysisResultEvent
  | ShortAnalysisErrorEvent;

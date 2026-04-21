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
  mode: "oauth" | "local" | "api_key";
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

export type ApiKeyRecord = {
  keyId: string;
  label: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};

export type SessionResponse = {
  auth: SessionAuth;
  account: SessionAccount | null;
  endpoints?: {
    appUrl?: string;
    apiDocsUrl?: string;
    apiKeys?: "enabled" | "disabled";
  };
  onboarding?: {
    state: "ready" | "first-run";
    nextAction?: string;
    checklist?: Array<{ id: string; label: string; done: boolean }>;
  };
  recentRuns?: RunRecord[];
  recentUsageEvents?: UsageEvent[];
  apiKeys?: ApiKeyRecord[];
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
  error: {
    code: string;
    message: string;
    stage?: string;
    retryable?: boolean;
  };
};

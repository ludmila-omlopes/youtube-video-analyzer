export type RemoteAccountPlan = "trial" | "builder" | "pro" | "business";

export const REMOTE_ACCOUNT_PLANS = ["trial", "builder", "pro", "business"] as const;

export type RemoteAccountEntitlements = {
  remoteMcpEnabled: boolean;
  apiKeysEnabled: boolean;
  historyRetentionDays: number | null;
  monthlyIncludedCredits: number | null;
  maxConcurrentLongJobs: number | null;
};

const DEFAULT_REMOTE_ACCOUNT_PLAN: RemoteAccountPlan = "trial";

const PLAN_ENTITLEMENTS: Record<RemoteAccountPlan, RemoteAccountEntitlements> = {
  trial: {
    remoteMcpEnabled: true,
    apiKeysEnabled: true,
    historyRetentionDays: 14,
    monthlyIncludedCredits: 15,
    maxConcurrentLongJobs: 1,
  },
  builder: {
    remoteMcpEnabled: true,
    apiKeysEnabled: true,
    historyRetentionDays: 30,
    monthlyIncludedCredits: 250,
    maxConcurrentLongJobs: 1,
  },
  pro: {
    remoteMcpEnabled: true,
    apiKeysEnabled: true,
    historyRetentionDays: 90,
    monthlyIncludedCredits: 1500,
    maxConcurrentLongJobs: 3,
  },
  business: {
    remoteMcpEnabled: true,
    apiKeysEnabled: true,
    historyRetentionDays: null,
    monthlyIncludedCredits: null,
    maxConcurrentLongJobs: null,
  },
};

export function getDefaultRemoteAccountPlan(): RemoteAccountPlan {
  return DEFAULT_REMOTE_ACCOUNT_PLAN;
}

export function resolveRemoteAccountPlan(raw: unknown): RemoteAccountPlan {
  switch (raw) {
    case "builder":
    case "pro":
    case "business":
    case "trial":
      return raw;
    case "free":
      return "trial";
    default:
      return DEFAULT_REMOTE_ACCOUNT_PLAN;
  }
}

export function isRemoteAccountPlan(raw: unknown): raw is RemoteAccountPlan {
  return typeof raw === "string" && (REMOTE_ACCOUNT_PLANS as readonly string[]).includes(raw);
}

export function getRemoteAccountEntitlements(plan: RemoteAccountPlan): RemoteAccountEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function getIncludedCreditsForPlan(plan: RemoteAccountPlan): number {
  return getRemoteAccountEntitlements(plan).monthlyIncludedCredits ?? 0;
}

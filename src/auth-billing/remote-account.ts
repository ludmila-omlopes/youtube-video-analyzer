import process from "node:process";

import { getPrincipalKey, type AuthPrincipal } from "./principal.js";
import {
  getDefaultRemoteAccountPlan,
  getIncludedCreditsForPlan,
  getRemoteAccountEntitlements,
  resolveRemoteAccountPlan,
  type RemoteAccountPlan,
} from "./entitlements.js";

export type { RemoteAccountEntitlements, RemoteAccountPlan } from "./entitlements.js";
export {
  getDefaultRemoteAccountPlan,
  getIncludedCreditsForPlan,
  getRemoteAccountEntitlements,
  resolveRemoteAccountPlan,
} from "./entitlements.js";

export type RemoteAccountStatus = "active" | "suspended";

export type RemoteAccount = {
  accountId: string;
  subject: string;
  issuer: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  plan: RemoteAccountPlan;
  status: RemoteAccountStatus;
  creditBalance: number;
};

export function getRemoteAccountInitialCredits(
  env: NodeJS.ProcessEnv = process.env,
  plan: RemoteAccountPlan = getDefaultRemoteAccountPlan()
): number {
  const raw = env.REMOTE_ACCOUNT_INITIAL_CREDITS?.trim();
  if (!raw) {
    return getIncludedCreditsForPlan(plan);
  }

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return getIncludedCreditsForPlan(plan);
  }

  return Math.floor(n);
}

function parseStoredCreditBalance(raw: Record<string, unknown>, plan: RemoteAccountPlan): number {
  if (typeof raw.creditBalance === "number" && Number.isFinite(raw.creditBalance) && raw.creditBalance >= 0) {
    return Math.floor(raw.creditBalance);
  }

  return getRemoteAccountInitialCredits(process.env, plan);
}

export function normalizeRemoteAccountFromStorage(raw: unknown, accountIdHint: string): RemoteAccount | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const r = raw as Record<string, unknown>;
  if (typeof r.accountId === "string" && r.accountId !== accountIdHint) {
    return null;
  }
  const accountId = accountIdHint;

  const subject = typeof r.subject === "string" ? r.subject : "";
  const issuer = typeof r.issuer === "string" ? r.issuer : "";
  const createdAt = typeof r.createdAt === "string" && r.createdAt.length > 0 ? r.createdAt : null;
  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt.length > 0 ? r.updatedAt : createdAt;
  const lastSeenAt =
    typeof r.lastSeenAt === "string" && r.lastSeenAt.length > 0
      ? r.lastSeenAt
      : updatedAt ?? createdAt ?? new Date(0).toISOString();

  const plan = resolveRemoteAccountPlan(r.plan);
  const status: RemoteAccountStatus = r.status === "suspended" ? "suspended" : "active";
  const creditBalance = parseStoredCreditBalance(r, plan);

  const safeCreated = createdAt ?? new Date(0).toISOString();
  const safeUpdated = updatedAt ?? safeCreated;

  return {
    accountId,
    subject,
    issuer,
    createdAt: safeCreated,
    updatedAt: safeUpdated,
    lastSeenAt,
    plan,
    status,
    creditBalance,
  };
}

export function mergeRemoteAccountOnUpsert(
  existing: RemoteAccount | null,
  principal: AuthPrincipal,
  now: string
): RemoteAccount {
  const accountId = getPrincipalKey(principal);

  if (!existing) {
    const plan = getDefaultRemoteAccountPlan();
    return {
      accountId,
      subject: principal.subject,
      issuer: principal.issuer,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      plan,
      status: "active",
      creditBalance: getRemoteAccountInitialCredits(process.env, plan),
    };
  }

  return {
    ...existing,
    accountId,
    subject: principal.subject,
    issuer: principal.issuer,
    updatedAt: now,
    lastSeenAt: now,
  };
}

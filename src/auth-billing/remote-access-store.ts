import process from "node:process";

import { Redis } from "ioredis";

import {
  assertCloudDurabilityRequirement,
  getRedisUrlFromEnv,
} from "../platform-runtime/durability-policy.js";
import { getPrincipalKey, type AuthPrincipal } from "./principal.js";
import {
  mergeRemoteAccountOnUpsert,
  normalizeRemoteAccountFromStorage,
  type RemoteAccount,
  type RemoteAccountPlan,
} from "./remote-account.js";

export type { RemoteAccount, RemoteAccountPlan, RemoteAccountStatus } from "./remote-account.js";

const ACCOUNT_KEY_PREFIX = "remote-access:account:";
const CREDIT_RESERVATION_KEY_PREFIX = "remote-access:credit-reservation:";
const JOB_OWNER_KEY_PREFIX = "remote-access:job-owner:";
const JOB_CREDIT_RESERVATION_KEY_PREFIX = "remote-access:job-credit-reservation:";
const SESSION_OWNER_KEY_PREFIX = "remote-access:session-owner:";

export type CreditReservationState = "reserved" | "finalized" | "released";

export type CreditReservation = {
  reservationId: string;
  accountId: string;
  credits: number;
  tool: string | null;
  state: CreditReservationState;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type ReserveCreditsInput = {
  reservationId: string;
  credits: number;
  tool?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreditReservationMutation = {
  account: RemoteAccount;
  reservation: CreditReservation;
  changed: boolean;
};

export type ListAccountsOptions = {
  /** Maximum accounts to return (capped internally). */
  limit?: number;
};

export interface RemoteAccessStore {
  upsertAccount(principal: AuthPrincipal): Promise<RemoteAccount>;
  getAccount(accountId: string): Promise<RemoteAccount | null>;
  /** Sorted by account id. Used for operator consoles; avoid hot paths. */
  listAccounts(options?: ListAccountsOptions): Promise<RemoteAccount[]>;
  setAccountPlan(accountId: string, plan: RemoteAccountPlan): Promise<RemoteAccount | null>;
  adjustAccountCredits(accountId: string, delta: number): Promise<RemoteAccount | null>;
  grantAccountCredits(accountId: string, credits: number): Promise<RemoteAccount | null>;
  reserveCredits(accountId: string, input: ReserveCreditsInput): Promise<CreditReservationMutation | null>;
  getCreditReservation(accountId: string, reservationId: string): Promise<CreditReservation | null>;
  finalizeCreditReservation(accountId: string, reservationId: string): Promise<CreditReservationMutation | null>;
  releaseCreditReservation(accountId: string, reservationId: string): Promise<CreditReservationMutation | null>;
  setJobOwner(jobId: string, accountId: string): Promise<void>;
  getJobOwner(jobId: string): Promise<string | null>;
  deleteJobOwner?(jobId: string): Promise<void>;
  setJobCreditReservation(jobId: string, reservationId: string): Promise<void>;
  getJobCreditReservation(jobId: string): Promise<string | null>;
  deleteJobCreditReservation?(jobId: string): Promise<void>;
  setSessionOwner(sessionId: string, accountId: string): Promise<void>;
  getSessionOwner(sessionId: string): Promise<string | null>;
  deleteSessionOwner?(sessionId: string): Promise<void>;
}

function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: 1 });
}

function readJsonUnknown(value: string | null): unknown | null {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as unknown;
}

function getAccountKey(accountId: string): string {
  return `${ACCOUNT_KEY_PREFIX}${accountId}`;
}

function getCreditReservationKey(accountId: string, reservationId: string): string {
  return `${CREDIT_RESERVATION_KEY_PREFIX}${accountId}:${reservationId}`;
}

function getJobOwnerKey(jobId: string): string {
  return `${JOB_OWNER_KEY_PREFIX}${jobId}`;
}

function getJobCreditReservationKey(jobId: string): string {
  return `${JOB_CREDIT_RESERVATION_KEY_PREFIX}${jobId}`;
}

function getSessionOwnerKey(sessionId: string): string {
  return `${SESSION_OWNER_KEY_PREFIX}${sessionId}`;
}

function normalizeReservationState(raw: unknown): CreditReservationState | null {
  switch (raw) {
    case "reserved":
    case "finalized":
    case "released":
      return raw;
    default:
      return null;
  }
}

function normalizeReservationMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as Record<string, unknown>;
}

function normalizeCreditReservationFromStorage(
  raw: unknown,
  accountIdHint: string,
  reservationIdHint: string
): CreditReservation | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.accountId === "string" && record.accountId !== accountIdHint) {
    return null;
  }

  if (typeof record.reservationId === "string" && record.reservationId !== reservationIdHint) {
    return null;
  }

  const credits =
    typeof record.credits === "number" && Number.isFinite(record.credits) && record.credits > 0
      ? Math.floor(record.credits)
      : null;
  const state = normalizeReservationState(record.state);
  if (!credits || !state) {
    return null;
  }

  const createdAt =
    typeof record.createdAt === "string" && record.createdAt.length > 0
      ? record.createdAt
      : new Date(0).toISOString();
  const updatedAt =
    typeof record.updatedAt === "string" && record.updatedAt.length > 0 ? record.updatedAt : createdAt;

  return {
    reservationId: reservationIdHint,
    accountId: accountIdHint,
    credits,
    tool: typeof record.tool === "string" && record.tool.length > 0 ? record.tool : null,
    state,
    createdAt,
    updatedAt,
    metadata: normalizeReservationMetadata(record.metadata),
  };
}

function createCreditReservation(accountId: string, input: ReserveCreditsInput, now: string): CreditReservation {
  return {
    reservationId: input.reservationId,
    accountId,
    credits: Math.floor(input.credits),
    tool: input.tool?.trim() || null,
    state: "reserved",
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata ?? {},
  };
}

function touchAccount(account: RemoteAccount, now: string): RemoteAccount {
  return {
    ...account,
    updatedAt: now,
    lastSeenAt: now,
  };
}

function updateAccountPlan(account: RemoteAccount, plan: RemoteAccountPlan, now: string): RemoteAccount {
  if (account.plan === plan) {
    return account;
  }

  return {
    ...account,
    plan,
    updatedAt: now,
  };
}

function adjustBalance(account: RemoteAccount, delta: number, now: string): RemoteAccount | null {
  if (account.status === "suspended" && delta < 0) {
    return null;
  }

  const nextBalance = account.creditBalance + delta;
  if (nextBalance < 0) {
    return null;
  }

  return {
    ...account,
    creditBalance: nextBalance,
    updatedAt: now,
    lastSeenAt: now,
  };
}

export class InMemoryRemoteAccessStore implements RemoteAccessStore {
  private readonly accounts = new Map<string, RemoteAccount>();
  private readonly creditReservations = new Map<string, CreditReservation>();
  private readonly jobOwners = new Map<string, string>();
  private readonly jobCreditReservations = new Map<string, string>();
  private readonly sessionOwners = new Map<string, string>();

  private getAccountSnapshot(accountId: string): RemoteAccount | null {
    const previous = this.accounts.get(accountId) ?? null;
    return previous ? normalizeRemoteAccountFromStorage(previous, accountId) : null;
  }

  private getReservationSnapshot(accountId: string, reservationId: string): CreditReservation | null {
    const previous = this.creditReservations.get(getCreditReservationKey(accountId, reservationId)) ?? null;
    return previous ? normalizeCreditReservationFromStorage(previous, accountId, reservationId) : null;
  }

  async upsertAccount(principal: AuthPrincipal): Promise<RemoteAccount> {
    const accountId = getPrincipalKey(principal);
    const now = new Date().toISOString();
    const existing = this.getAccountSnapshot(accountId);
    const account = mergeRemoteAccountOnUpsert(existing, principal, now);

    this.accounts.set(accountId, account);
    return account;
  }

  async getAccount(accountId: string): Promise<RemoteAccount | null> {
    return this.getAccountSnapshot(accountId);
  }

  async listAccounts(options?: ListAccountsOptions): Promise<RemoteAccount[]> {
    const cap = Math.min(Math.max(options?.limit ?? 500, 1), 2000);
    const ids = [...this.accounts.keys()].sort();
    const slice = ids.slice(0, cap);
    const out: RemoteAccount[] = [];
    for (const id of slice) {
      const acc = this.getAccountSnapshot(id);
      if (acc) {
        out.push(acc);
      }
    }
    return out;
  }

  async setAccountPlan(accountId: string, plan: RemoteAccountPlan): Promise<RemoteAccount | null> {
    const existing = this.getAccountSnapshot(accountId);
    if (!existing) {
      return null;
    }

    const updated = updateAccountPlan(existing, plan, new Date().toISOString());
    this.accounts.set(accountId, updated);
    return updated;
  }

  async adjustAccountCredits(accountId: string, delta: number): Promise<RemoteAccount | null> {
    const existing = this.getAccountSnapshot(accountId);
    if (!existing) {
      return null;
    }

    const updated = adjustBalance(existing, delta, new Date().toISOString());
    if (!updated) {
      return null;
    }

    this.accounts.set(accountId, updated);
    return updated;
  }

  async grantAccountCredits(accountId: string, credits: number): Promise<RemoteAccount | null> {
    if (!Number.isFinite(credits) || credits < 0) {
      return null;
    }

    return this.adjustAccountCredits(accountId, Math.floor(credits));
  }

  async reserveCredits(accountId: string, input: ReserveCreditsInput): Promise<CreditReservationMutation | null> {
    if (!input.reservationId.trim() || !Number.isFinite(input.credits) || input.credits <= 0) {
      return null;
    }

    const existingReservation = this.getReservationSnapshot(accountId, input.reservationId);
    const existingAccount = this.getAccountSnapshot(accountId);
    if (!existingAccount) {
      return null;
    }

    if (existingReservation) {
      if (existingReservation.state !== "reserved") {
        return null;
      }

      return {
        account: existingAccount,
        reservation: existingReservation,
        changed: false,
      };
    }

    const now = new Date().toISOString();
    const nextAccount = adjustBalance(existingAccount, -Math.floor(input.credits), now);
    if (!nextAccount) {
      return null;
    }

    const reservation = createCreditReservation(accountId, input, now);
    this.accounts.set(accountId, nextAccount);
    this.creditReservations.set(getCreditReservationKey(accountId, input.reservationId), reservation);

    return {
      account: nextAccount,
      reservation,
      changed: true,
    };
  }

  async getCreditReservation(accountId: string, reservationId: string): Promise<CreditReservation | null> {
    return this.getReservationSnapshot(accountId, reservationId);
  }

  async finalizeCreditReservation(
    accountId: string,
    reservationId: string
  ): Promise<CreditReservationMutation | null> {
    const account = this.getAccountSnapshot(accountId);
    const reservation = this.getReservationSnapshot(accountId, reservationId);
    if (!account || !reservation) {
      return null;
    }

    if (reservation.state === "finalized") {
      return {
        account,
        reservation,
        changed: false,
      };
    }

    if (reservation.state !== "reserved") {
      return null;
    }

    const now = new Date().toISOString();
    const updatedAccount = touchAccount(account, now);
    const updatedReservation: CreditReservation = {
      ...reservation,
      state: "finalized",
      updatedAt: now,
    };

    this.accounts.set(accountId, updatedAccount);
    this.creditReservations.set(getCreditReservationKey(accountId, reservationId), updatedReservation);

    return {
      account: updatedAccount,
      reservation: updatedReservation,
      changed: true,
    };
  }

  async releaseCreditReservation(accountId: string, reservationId: string): Promise<CreditReservationMutation | null> {
    const account = this.getAccountSnapshot(accountId);
    const reservation = this.getReservationSnapshot(accountId, reservationId);
    if (!account || !reservation) {
      return null;
    }

    if (reservation.state === "released") {
      return {
        account,
        reservation,
        changed: false,
      };
    }

    if (reservation.state !== "reserved") {
      return null;
    }

    const now = new Date().toISOString();
    const updatedAccount = adjustBalance(account, reservation.credits, now);
    if (!updatedAccount) {
      return null;
    }

    const updatedReservation: CreditReservation = {
      ...reservation,
      state: "released",
      updatedAt: now,
    };

    this.accounts.set(accountId, updatedAccount);
    this.creditReservations.set(getCreditReservationKey(accountId, reservationId), updatedReservation);

    return {
      account: updatedAccount,
      reservation: updatedReservation,
      changed: true,
    };
  }

  async setJobOwner(jobId: string, accountId: string): Promise<void> {
    this.jobOwners.set(jobId, accountId);
  }

  async getJobOwner(jobId: string): Promise<string | null> {
    return this.jobOwners.get(jobId) ?? null;
  }

  async deleteJobOwner(jobId: string): Promise<void> {
    this.jobOwners.delete(jobId);
  }

  async setJobCreditReservation(jobId: string, reservationId: string): Promise<void> {
    this.jobCreditReservations.set(jobId, reservationId);
  }

  async getJobCreditReservation(jobId: string): Promise<string | null> {
    return this.jobCreditReservations.get(jobId) ?? null;
  }

  async deleteJobCreditReservation(jobId: string): Promise<void> {
    this.jobCreditReservations.delete(jobId);
  }

  async setSessionOwner(sessionId: string, accountId: string): Promise<void> {
    this.sessionOwners.set(sessionId, accountId);
  }

  async getSessionOwner(sessionId: string): Promise<string | null> {
    return this.sessionOwners.get(sessionId) ?? null;
  }

  async deleteSessionOwner(sessionId: string): Promise<void> {
    this.sessionOwners.delete(sessionId);
  }
}

export class RedisRemoteAccessStore implements RemoteAccessStore {
  constructor(private readonly redis: Redis) {}

  async upsertAccount(principal: AuthPrincipal): Promise<RemoteAccount> {
    const accountId = getPrincipalKey(principal);
    const key = getAccountKey(accountId);
    const raw = readJsonUnknown(await this.redis.get(key));
    const now = new Date().toISOString();
    const existing = raw ? normalizeRemoteAccountFromStorage(raw, accountId) : null;
    const account = mergeRemoteAccountOnUpsert(existing, principal, now);

    await this.redis.set(key, JSON.stringify(account));
    return account;
  }

  async getAccount(accountId: string): Promise<RemoteAccount | null> {
    const raw = readJsonUnknown(await this.redis.get(getAccountKey(accountId)));
    return raw ? normalizeRemoteAccountFromStorage(raw, accountId) : null;
  }

  async listAccounts(options?: ListAccountsOptions): Promise<RemoteAccount[]> {
    const cap = Math.min(Math.max(options?.limit ?? 500, 1), 2000);
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.redis.scan(cursor, "MATCH", `${ACCOUNT_KEY_PREFIX}*`, "COUNT", 200);
      keys.push(...batch);
      cursor = next;
    } while (cursor !== "0");

    const ids = keys
      .map((key) => (key.startsWith(ACCOUNT_KEY_PREFIX) ? key.slice(ACCOUNT_KEY_PREFIX.length) : ""))
      .filter(Boolean)
      .sort()
      .slice(0, cap);

    if (ids.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(getAccountKey(id));
    }
    const results = await pipeline.exec();
    const out: RemoteAccount[] = [];
    ids.forEach((id, index) => {
      const raw = readJsonUnknown(results?.[index]?.[1] as string | null);
      const acc = raw ? normalizeRemoteAccountFromStorage(raw, id) : null;
      if (acc) {
        out.push(acc);
      }
    });
    return out;
  }

  async setAccountPlan(accountId: string, plan: RemoteAccountPlan): Promise<RemoteAccount | null> {
    const accountKey = getAccountKey(accountId);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.redis.watch(accountKey);
      const raw = readJsonUnknown(await this.redis.get(accountKey));
      const existing = raw ? normalizeRemoteAccountFromStorage(raw, accountId) : null;

      if (!existing) {
        await this.redis.unwatch();
        return null;
      }

      const updated = updateAccountPlan(existing, plan, new Date().toISOString());
      const execResult = await this.redis.multi().set(accountKey, JSON.stringify(updated)).exec();
      if (execResult === null) {
        continue;
      }

      return updated;
    }

    return null;
  }

  async adjustAccountCredits(accountId: string, delta: number): Promise<RemoteAccount | null> {
    const accountKey = getAccountKey(accountId);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.redis.watch(accountKey);
      const raw = readJsonUnknown(await this.redis.get(accountKey));
      const existing = raw ? normalizeRemoteAccountFromStorage(raw, accountId) : null;

      if (!existing) {
        await this.redis.unwatch();
        return null;
      }

      const updated = adjustBalance(existing, delta, new Date().toISOString());
      if (!updated) {
        await this.redis.unwatch();
        return null;
      }

      const execResult = await this.redis.multi().set(accountKey, JSON.stringify(updated)).exec();
      if (execResult === null) {
        continue;
      }

      return updated;
    }

    return null;
  }

  async grantAccountCredits(accountId: string, credits: number): Promise<RemoteAccount | null> {
    if (!Number.isFinite(credits) || credits < 0) {
      return null;
    }

    return this.adjustAccountCredits(accountId, Math.floor(credits));
  }

  async reserveCredits(accountId: string, input: ReserveCreditsInput): Promise<CreditReservationMutation | null> {
    if (!input.reservationId.trim() || !Number.isFinite(input.credits) || input.credits <= 0) {
      return null;
    }

    const accountKey = getAccountKey(accountId);
    const reservationKey = getCreditReservationKey(accountId, input.reservationId);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.redis.watch(accountKey, reservationKey);
      const [rawAccount, rawReservation] = await Promise.all([
        this.redis.get(accountKey),
        this.redis.get(reservationKey),
      ]);

      const account = rawAccount ? normalizeRemoteAccountFromStorage(readJsonUnknown(rawAccount), accountId) : null;
      const existingReservation = rawReservation
        ? normalizeCreditReservationFromStorage(readJsonUnknown(rawReservation), accountId, input.reservationId)
        : null;

      if (!account) {
        await this.redis.unwatch();
        return null;
      }

      if (existingReservation) {
        await this.redis.unwatch();
        if (existingReservation.state !== "reserved") {
          return null;
        }

        return {
          account,
          reservation: existingReservation,
          changed: false,
        };
      }

      const now = new Date().toISOString();
      const nextAccount = adjustBalance(account, -Math.floor(input.credits), now);
      if (!nextAccount) {
        await this.redis.unwatch();
        return null;
      }

      const reservation = createCreditReservation(accountId, input, now);
      const execResult = await this.redis
        .multi()
        .set(accountKey, JSON.stringify(nextAccount))
        .set(reservationKey, JSON.stringify(reservation))
        .exec();
      if (execResult === null) {
        continue;
      }

      return {
        account: nextAccount,
        reservation,
        changed: true,
      };
    }

    return null;
  }

  async getCreditReservation(accountId: string, reservationId: string): Promise<CreditReservation | null> {
    const raw = readJsonUnknown(await this.redis.get(getCreditReservationKey(accountId, reservationId)));
    return raw ? normalizeCreditReservationFromStorage(raw, accountId, reservationId) : null;
  }

  async finalizeCreditReservation(
    accountId: string,
    reservationId: string
  ): Promise<CreditReservationMutation | null> {
    const accountKey = getAccountKey(accountId);
    const reservationKey = getCreditReservationKey(accountId, reservationId);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.redis.watch(accountKey, reservationKey);
      const [rawAccount, rawReservation] = await Promise.all([
        this.redis.get(accountKey),
        this.redis.get(reservationKey),
      ]);

      const account = rawAccount ? normalizeRemoteAccountFromStorage(readJsonUnknown(rawAccount), accountId) : null;
      const reservation = rawReservation
        ? normalizeCreditReservationFromStorage(readJsonUnknown(rawReservation), accountId, reservationId)
        : null;

      if (!account || !reservation) {
        await this.redis.unwatch();
        return null;
      }

      if (reservation.state === "finalized") {
        await this.redis.unwatch();
        return {
          account,
          reservation,
          changed: false,
        };
      }

      if (reservation.state !== "reserved") {
        await this.redis.unwatch();
        return null;
      }

      const now = new Date().toISOString();
      const updatedAccount = touchAccount(account, now);
      const updatedReservation: CreditReservation = {
        ...reservation,
        state: "finalized",
        updatedAt: now,
      };

      const execResult = await this.redis
        .multi()
        .set(accountKey, JSON.stringify(updatedAccount))
        .set(reservationKey, JSON.stringify(updatedReservation))
        .exec();
      if (execResult === null) {
        continue;
      }

      return {
        account: updatedAccount,
        reservation: updatedReservation,
        changed: true,
      };
    }

    return null;
  }

  async releaseCreditReservation(accountId: string, reservationId: string): Promise<CreditReservationMutation | null> {
    const accountKey = getAccountKey(accountId);
    const reservationKey = getCreditReservationKey(accountId, reservationId);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.redis.watch(accountKey, reservationKey);
      const [rawAccount, rawReservation] = await Promise.all([
        this.redis.get(accountKey),
        this.redis.get(reservationKey),
      ]);

      const account = rawAccount ? normalizeRemoteAccountFromStorage(readJsonUnknown(rawAccount), accountId) : null;
      const reservation = rawReservation
        ? normalizeCreditReservationFromStorage(readJsonUnknown(rawReservation), accountId, reservationId)
        : null;

      if (!account || !reservation) {
        await this.redis.unwatch();
        return null;
      }

      if (reservation.state === "released") {
        await this.redis.unwatch();
        return {
          account,
          reservation,
          changed: false,
        };
      }

      if (reservation.state !== "reserved") {
        await this.redis.unwatch();
        return null;
      }

      const now = new Date().toISOString();
      const updatedAccount = adjustBalance(account, reservation.credits, now);
      if (!updatedAccount) {
        await this.redis.unwatch();
        return null;
      }

      const updatedReservation: CreditReservation = {
        ...reservation,
        state: "released",
        updatedAt: now,
      };

      const execResult = await this.redis
        .multi()
        .set(accountKey, JSON.stringify(updatedAccount))
        .set(reservationKey, JSON.stringify(updatedReservation))
        .exec();
      if (execResult === null) {
        continue;
      }

      return {
        account: updatedAccount,
        reservation: updatedReservation,
        changed: true,
      };
    }

    return null;
  }

  async setJobOwner(jobId: string, accountId: string): Promise<void> {
    await this.redis.set(getJobOwnerKey(jobId), accountId);
  }

  async getJobOwner(jobId: string): Promise<string | null> {
    return await this.redis.get(getJobOwnerKey(jobId));
  }

  async deleteJobOwner(jobId: string): Promise<void> {
    await this.redis.del(getJobOwnerKey(jobId));
  }

  async setJobCreditReservation(jobId: string, reservationId: string): Promise<void> {
    await this.redis.set(getJobCreditReservationKey(jobId), reservationId);
  }

  async getJobCreditReservation(jobId: string): Promise<string | null> {
    return await this.redis.get(getJobCreditReservationKey(jobId));
  }

  async deleteJobCreditReservation(jobId: string): Promise<void> {
    await this.redis.del(getJobCreditReservationKey(jobId));
  }

  async setSessionOwner(sessionId: string, accountId: string): Promise<void> {
    await this.redis.set(getSessionOwnerKey(sessionId), accountId);
  }

  async getSessionOwner(sessionId: string): Promise<string | null> {
    return await this.redis.get(getSessionOwnerKey(sessionId));
  }

  async deleteSessionOwner(sessionId: string): Promise<void> {
    await this.redis.del(getSessionOwnerKey(sessionId));
  }
}

let sharedRemoteAccessStore: RemoteAccessStore | null = null;

export function createRemoteAccessStoreFromEnv(env: NodeJS.ProcessEnv = process.env): RemoteAccessStore {
  const shouldUseSharedInstance = env === process.env;

  const redisUrl = getRedisUrlFromEnv(env);
  if (!redisUrl) {
    assertCloudDurabilityRequirement("remote_access_store", env);
    if (!shouldUseSharedInstance) {
      return new InMemoryRemoteAccessStore();
    }

    if (sharedRemoteAccessStore) {
      return sharedRemoteAccessStore;
    }

    sharedRemoteAccessStore = new InMemoryRemoteAccessStore();
    return sharedRemoteAccessStore;
  }

  if (!shouldUseSharedInstance) {
    return new RedisRemoteAccessStore(createRedisConnection(redisUrl));
  }

  if (sharedRemoteAccessStore) {
    return sharedRemoteAccessStore;
  }

  sharedRemoteAccessStore = new RedisRemoteAccessStore(createRedisConnection(redisUrl));
  return sharedRemoteAccessStore;
}

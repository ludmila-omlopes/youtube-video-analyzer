import process from "node:process";

import { Redis } from "ioredis";

import { getPrincipalKey, type AuthPrincipal } from "../lib/auth/principal.js";

const ACCOUNT_KEY_PREFIX = "remote-access:account:";
const JOB_OWNER_KEY_PREFIX = "remote-access:job-owner:";
const SESSION_OWNER_KEY_PREFIX = "remote-access:session-owner:";

export type RemoteAccount = {
  accountId: string;
  subject: string;
  issuer: string;
  createdAt: string;
  updatedAt: string;
};

export interface RemoteAccessStore {
  upsertAccount(principal: AuthPrincipal): Promise<RemoteAccount>;
  getAccount(accountId: string): Promise<RemoteAccount | null>;
  setJobOwner(jobId: string, accountId: string): Promise<void>;
  getJobOwner(jobId: string): Promise<string | null>;
  deleteJobOwner?(jobId: string): Promise<void>;
  setSessionOwner(sessionId: string, accountId: string): Promise<void>;
  getSessionOwner(sessionId: string): Promise<string | null>;
  deleteSessionOwner?(sessionId: string): Promise<void>;
}

function getRedisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const redisUrl = env.REDIS_URL?.trim();
  if (redisUrl) {
    return redisUrl;
  }

  const redisHost = env.REDIS_HOST?.trim();
  if (!redisHost) {
    return null;
  }

  const redisPort = env.REDIS_PORT?.trim() || "6379";
  return `redis://${redisHost}:${redisPort}`;
}

function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: 1 });
}

function createRemoteAccount(principal: AuthPrincipal, createdAt: string, updatedAt: string): RemoteAccount {
  return {
    accountId: getPrincipalKey(principal),
    subject: principal.subject,
    issuer: principal.issuer,
    createdAt,
    updatedAt,
  };
}

function readJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as T;
}

export class InMemoryRemoteAccessStore implements RemoteAccessStore {
  private readonly accounts = new Map<string, RemoteAccount>();
  private readonly jobOwners = new Map<string, string>();
  private readonly sessionOwners = new Map<string, string>();

  async upsertAccount(principal: AuthPrincipal): Promise<RemoteAccount> {
    const accountId = getPrincipalKey(principal);
    const now = new Date().toISOString();
    const existing = this.accounts.get(accountId);
    const account = existing
      ? {
          ...existing,
          subject: principal.subject,
          issuer: principal.issuer,
          updatedAt: now,
        }
      : createRemoteAccount(principal, now, now);

    this.accounts.set(accountId, account);
    return account;
  }

  async getAccount(accountId: string): Promise<RemoteAccount | null> {
    return this.accounts.get(accountId) ?? null;
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
    const key = `${ACCOUNT_KEY_PREFIX}${accountId}`;
    const existing = readJson<RemoteAccount>(await this.redis.get(key));
    const now = new Date().toISOString();
    const account = existing
      ? {
          ...existing,
          subject: principal.subject,
          issuer: principal.issuer,
          updatedAt: now,
        }
      : createRemoteAccount(principal, now, now);

    await this.redis.set(key, JSON.stringify(account));
    return account;
  }

  async getAccount(accountId: string): Promise<RemoteAccount | null> {
    return readJson<RemoteAccount>(await this.redis.get(`${ACCOUNT_KEY_PREFIX}${accountId}`));
  }

  async setJobOwner(jobId: string, accountId: string): Promise<void> {
    await this.redis.set(`${JOB_OWNER_KEY_PREFIX}${jobId}`, accountId);
  }

  async getJobOwner(jobId: string): Promise<string | null> {
    return await this.redis.get(`${JOB_OWNER_KEY_PREFIX}${jobId}`);
  }

  async deleteJobOwner(jobId: string): Promise<void> {
    await this.redis.del(`${JOB_OWNER_KEY_PREFIX}${jobId}`);
  }

  async setSessionOwner(sessionId: string, accountId: string): Promise<void> {
    await this.redis.set(`${SESSION_OWNER_KEY_PREFIX}${sessionId}`, accountId);
  }

  async getSessionOwner(sessionId: string): Promise<string | null> {
    return await this.redis.get(`${SESSION_OWNER_KEY_PREFIX}${sessionId}`);
  }

  async deleteSessionOwner(sessionId: string): Promise<void> {
    await this.redis.del(`${SESSION_OWNER_KEY_PREFIX}${sessionId}`);
  }
}

let sharedRemoteAccessStore: RemoteAccessStore | null = null;

export function createRemoteAccessStoreFromEnv(env: NodeJS.ProcessEnv = process.env): RemoteAccessStore {
  if (sharedRemoteAccessStore) {
    return sharedRemoteAccessStore;
  }

  const redisUrl = getRedisUrl(env);
  sharedRemoteAccessStore = redisUrl
    ? new RedisRemoteAccessStore(createRedisConnection(redisUrl))
    : new InMemoryRemoteAccessStore();

  return sharedRemoteAccessStore;
}

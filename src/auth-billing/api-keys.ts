import process from "node:process";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Redis } from "ioredis";

import {
  assertCloudDurabilityRequirement,
  getRedisUrlFromEnv,
} from "../platform-runtime/durability-policy.js";
import type { AuthPrincipal } from "./principal.js";
import { getPrincipalKey } from "./principal.js";

const API_KEY_RECORD_PREFIX = "api-key:record:";
const API_KEY_HASH_PREFIX = "api-key:hash:";
const API_KEY_ACCOUNT_PREFIX = "api-key:account:";

type ApiKeyJsonClient = Pick<Redis, "get" | "set" | "lpush" | "lrange" | "del">;

export type ApiKeyRecord = {
  keyId: string;
  accountId: string;
  subject: string;
  issuer: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedApiKey = {
  plaintextKey: string;
  record: ApiKeyRecord;
};

export type AuthenticatedApiKey = {
  record: ApiKeyRecord;
  principal: AuthPrincipal;
};

export interface ApiKeyStore {
  createApiKey(principal: AuthPrincipal, label: string): Promise<CreatedApiKey>;
  listApiKeys(accountId: string): Promise<ApiKeyRecord[]>;
  revokeApiKey(accountId: string, keyId: string): Promise<boolean>;
  authenticateApiKey(rawKey: string): Promise<AuthenticatedApiKey | null>;
}

function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: 1 });
}

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function createPlaintextApiKey(keyId: string): string {
  return `ya_live_${keyId.replaceAll("-", "")}_${randomBytes(24).toString("base64url")}`;
}

function toPrefix(rawKey: string): string {
  return rawKey.slice(0, 18);
}

function toAuthPrincipal(record: ApiKeyRecord): AuthPrincipal {
  return {
    subject: record.subject,
    issuer: record.issuer,
    audience: ["youtube-analyzer-web", "youtube-analyzer-mcp"],
    scope: ["api:key"],
    tokenId: record.keyId,
    rawClaims: {
      authMethod: "api_key",
      accountId: record.accountId,
      keyId: record.keyId,
      label: record.label,
    },
  };
}

function getRecordKey(keyId: string): string {
  return `${API_KEY_RECORD_PREFIX}${keyId}`;
}

function getHashKey(rawKey: string): string {
  return `${API_KEY_HASH_PREFIX}${hashApiKey(rawKey)}`;
}

function getAccountKey(accountId: string): string {
  return `${API_KEY_ACCOUNT_PREFIX}${accountId}`;
}

function parseRecord(raw: string | null): ApiKeyRecord | null {
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as ApiKeyRecord;
}

function normalizeLabel(label: string | undefined): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed.slice(0, 80) : "Programmatic key";
}

export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly records = new Map<string, ApiKeyRecord>();
  private readonly hashes = new Map<string, string>();
  private readonly accountKeys = new Map<string, string[]>();

  async createApiKey(principal: AuthPrincipal, label: string): Promise<CreatedApiKey> {
    const keyId = randomUUID();
    const plaintextKey = createPlaintextApiKey(keyId);
    const accountId = getPrincipalKey(principal);
    const record: ApiKeyRecord = {
      keyId,
      accountId,
      subject: principal.subject,
      issuer: principal.issuer,
      label: normalizeLabel(label),
      prefix: toPrefix(plaintextKey),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };

    this.records.set(keyId, record);
    this.hashes.set(hashApiKey(plaintextKey), keyId);
    this.accountKeys.set(accountId, [keyId, ...(this.accountKeys.get(accountId) ?? [])]);

    return { plaintextKey, record };
  }

  async listApiKeys(accountId: string): Promise<ApiKeyRecord[]> {
    return (this.accountKeys.get(accountId) ?? [])
      .map((keyId) => this.records.get(keyId) ?? null)
      .filter((record): record is ApiKeyRecord => Boolean(record));
  }

  async revokeApiKey(accountId: string, keyId: string): Promise<boolean> {
    const record = this.records.get(keyId);
    if (!record || record.accountId !== accountId || record.revokedAt) {
      return false;
    }

    this.records.set(keyId, {
      ...record,
      revokedAt: new Date().toISOString(),
    });
    return true;
  }

  async authenticateApiKey(rawKey: string): Promise<AuthenticatedApiKey | null> {
    const keyId = this.hashes.get(hashApiKey(rawKey));
    if (!keyId) {
      return null;
    }

    const record = this.records.get(keyId);
    if (!record || record.revokedAt) {
      return null;
    }

    const updated = {
      ...record,
      lastUsedAt: new Date().toISOString(),
    };
    this.records.set(keyId, updated);

    return {
      record: updated,
      principal: toAuthPrincipal(updated),
    };
  }
}

export class RedisApiKeyStore implements ApiKeyStore {
  constructor(private readonly redis: ApiKeyJsonClient) {}

  async createApiKey(principal: AuthPrincipal, label: string): Promise<CreatedApiKey> {
    const keyId = randomUUID();
    const plaintextKey = createPlaintextApiKey(keyId);
    const accountId = getPrincipalKey(principal);
    const record: ApiKeyRecord = {
      keyId,
      accountId,
      subject: principal.subject,
      issuer: principal.issuer,
      label: normalizeLabel(label),
      prefix: toPrefix(plaintextKey),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };

    await Promise.all([
      this.redis.set(getRecordKey(keyId), JSON.stringify(record)),
      this.redis.set(getHashKey(plaintextKey), keyId),
      this.redis.lpush(getAccountKey(accountId), keyId),
    ]);

    return { plaintextKey, record };
  }

  async listApiKeys(accountId: string): Promise<ApiKeyRecord[]> {
    const keyIds = await this.redis.lrange(getAccountKey(accountId), 0, -1);
    const records = await Promise.all(keyIds.map((keyId) => this.redis.get(getRecordKey(keyId))));
    return records
      .map(parseRecord)
      .filter((record): record is ApiKeyRecord => Boolean(record));
  }

  async revokeApiKey(accountId: string, keyId: string): Promise<boolean> {
    const record = parseRecord(await this.redis.get(getRecordKey(keyId)));
    if (!record || record.accountId !== accountId || record.revokedAt) {
      return false;
    }

    const updated: ApiKeyRecord = {
      ...record,
      revokedAt: new Date().toISOString(),
    };

    await this.redis.set(getRecordKey(keyId), JSON.stringify(updated));

    return true;
  }

  async authenticateApiKey(rawKey: string): Promise<AuthenticatedApiKey | null> {
    const keyId = await this.redis.get(getHashKey(rawKey));
    if (!keyId) {
      return null;
    }

    const record = parseRecord(await this.redis.get(getRecordKey(keyId)));
    if (!record || record.revokedAt) {
      return null;
    }

    const updated: ApiKeyRecord = {
      ...record,
      lastUsedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.redis.set(getRecordKey(record.keyId), JSON.stringify(updated)),
    ]);

    return {
      record: updated,
      principal: toAuthPrincipal(updated),
    };
  }
}

let sharedApiKeyStore: ApiKeyStore | null = null;

export function createApiKeyStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ApiKeyStore {
  const shouldUseSharedInstance = env === process.env;
  const redisUrl = getRedisUrlFromEnv(env);

  if (!redisUrl) {
    assertCloudDurabilityRequirement("api_key_store", env);
    if (!shouldUseSharedInstance) {
      return new InMemoryApiKeyStore();
    }

    if (sharedApiKeyStore) {
      return sharedApiKeyStore;
    }

    sharedApiKeyStore = new InMemoryApiKeyStore();
    return sharedApiKeyStore;
  }

  if (!shouldUseSharedInstance) {
    return new RedisApiKeyStore(createRedisConnection(redisUrl));
  }

  if (sharedApiKeyStore) {
    return sharedApiKeyStore;
  }

  sharedApiKeyStore = new RedisApiKeyStore(createRedisConnection(redisUrl));
  return sharedApiKeyStore;
}

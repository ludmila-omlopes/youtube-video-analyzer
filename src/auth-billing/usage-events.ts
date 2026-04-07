import process from "node:process";
import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";

import {
  assertCloudDurabilityRequirement,
  getRedisUrlFromEnv,
} from "../platform-runtime/durability-policy.js";

const USAGE_EVENT_KEY_PREFIX = "usage-events:account:";

export type UsageEventKind =
  | "account.plan_changed"
  | "analysis.short.completed"
  | "analysis.audio.completed"
  | "analysis.long_job.queued"
  | "credits.granted"
  | "credits.reserved"
  | "credits.finalized"
  | "credits.released"
  | "credits.finalize_failed"
  | "credits.release_failed";

export type UsageEvent = {
  eventId: string;
  occurredAt: string;
  accountId: string;
  kind: UsageEventKind;
  tool: string;
  creditsDelta?: number;
  creditsBalance?: number | null;
  metadata?: Record<string, unknown>;
};

export interface UsageEventStore {
  append(event: Omit<UsageEvent, "eventId" | "occurredAt">): Promise<UsageEvent>;
  listForAccount(accountId: string): Promise<UsageEvent[]>;
}

type UsageEventListClient = Pick<Redis, "lpush" | "lrange">;

function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: 1 });
}

function getUsageEventKey(accountId: string): string {
  return `${USAGE_EVENT_KEY_PREFIX}${accountId}`;
}

function normalizeEvent(event: Omit<UsageEvent, "eventId" | "occurredAt">): UsageEvent {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    creditsBalance: event.creditsBalance ?? null,
    metadata: event.metadata ?? {},
    ...event,
  };
}

function parseUsageEvent(raw: string): UsageEvent {
  return JSON.parse(raw) as UsageEvent;
}

export class InMemoryUsageEventStore implements UsageEventStore {
  private readonly events = new Map<string, UsageEvent[]>();

  async append(event: Omit<UsageEvent, "eventId" | "occurredAt">): Promise<UsageEvent> {
    const normalized = normalizeEvent(event);
    const existing = this.events.get(normalized.accountId) ?? [];
    this.events.set(normalized.accountId, [normalized, ...existing]);
    return normalized;
  }

  async listForAccount(accountId: string): Promise<UsageEvent[]> {
    return [...(this.events.get(accountId) ?? [])];
  }
}

export class RedisUsageEventStore implements UsageEventStore {
  constructor(private readonly redis: UsageEventListClient) {}

  async append(event: Omit<UsageEvent, "eventId" | "occurredAt">): Promise<UsageEvent> {
    const normalized = normalizeEvent(event);
    await this.redis.lpush(getUsageEventKey(normalized.accountId), JSON.stringify(normalized));
    return normalized;
  }

  async listForAccount(accountId: string): Promise<UsageEvent[]> {
    const entries = await this.redis.lrange(getUsageEventKey(accountId), 0, -1);
    return entries.map(parseUsageEvent);
  }
}

let sharedUsageEventStore: UsageEventStore | null = null;

export function createUsageEventStoreFromEnv(env: NodeJS.ProcessEnv = process.env): UsageEventStore {
  const shouldUseSharedInstance = env === process.env;

  const redisUrl = getRedisUrlFromEnv(env);
  if (!redisUrl) {
    assertCloudDurabilityRequirement("usage_event_store", env);
    if (!shouldUseSharedInstance) {
      return new InMemoryUsageEventStore();
    }

    if (sharedUsageEventStore) {
      return sharedUsageEventStore;
    }

    sharedUsageEventStore = new InMemoryUsageEventStore();
    return sharedUsageEventStore;
  }

  if (!shouldUseSharedInstance) {
    return new RedisUsageEventStore(createRedisConnection(redisUrl));
  }

  if (sharedUsageEventStore) {
    return sharedUsageEventStore;
  }

  sharedUsageEventStore = new RedisUsageEventStore(createRedisConnection(redisUrl));
  return sharedUsageEventStore;
}

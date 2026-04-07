import process from "node:process";
import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";

import {
  assertCloudDurabilityRequirement,
  getRedisUrlFromEnv,
} from "./durability-policy.js";

const WORKFLOW_RUN_KEY_PREFIX = "workflow-runs:account:";

export type WorkflowRunStatus = "completed" | "failed";

export type WorkflowRunError = {
  message: string;
  code: string | null;
};

export type WorkflowRunRecord = {
  runId: string;
  accountId: string;
  workflowId: string;
  workflowLabel: string;
  status: WorkflowRunStatus;
  createdAt: string;
  youtubeUrl: string;
  normalizedYoutubeUrl: string | null;
  videoTitle: string | null;
  summary: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: WorkflowRunError | null;
};

export interface WorkflowRunStore {
  appendRun(
    record: Omit<WorkflowRunRecord, "runId" | "createdAt"> & { runId?: string; createdAt?: string }
  ): Promise<WorkflowRunRecord>;
  listRunsForAccount(accountId: string, limit?: number): Promise<WorkflowRunRecord[]>;
}

type WorkflowRunListClient = Pick<Redis, "lpush" | "lrange">;

function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: 1 });
}

function getWorkflowRunKey(accountId: string): string {
  return `${WORKFLOW_RUN_KEY_PREFIX}${accountId}`;
}

function normalizeWorkflowRun(
  record: Omit<WorkflowRunRecord, "runId" | "createdAt"> & { runId?: string; createdAt?: string }
): WorkflowRunRecord {
  return {
    ...record,
    runId: record.runId?.trim() || randomUUID(),
    createdAt: record.createdAt?.trim() || new Date().toISOString(),
    normalizedYoutubeUrl: record.normalizedYoutubeUrl ?? null,
    videoTitle: record.videoTitle ?? null,
    summary: record.summary ?? null,
    output: record.output ?? null,
    error: record.error ?? null,
  };
}

function parseWorkflowRun(raw: string): WorkflowRunRecord {
  return JSON.parse(raw) as WorkflowRunRecord;
}

export class InMemoryWorkflowRunStore implements WorkflowRunStore {
  private readonly records = new Map<string, WorkflowRunRecord[]>();

  async appendRun(
    record: Omit<WorkflowRunRecord, "runId" | "createdAt"> & { runId?: string; createdAt?: string }
  ): Promise<WorkflowRunRecord> {
    const normalized = normalizeWorkflowRun(record);
    const existing = this.records.get(normalized.accountId) ?? [];
    this.records.set(normalized.accountId, [normalized, ...existing]);
    return normalized;
  }

  async listRunsForAccount(accountId: string, limit = 20): Promise<WorkflowRunRecord[]> {
    return [...(this.records.get(accountId) ?? [])].slice(0, Math.max(0, limit));
  }
}

export class RedisWorkflowRunStore implements WorkflowRunStore {
  constructor(private readonly redis: WorkflowRunListClient) {}

  async appendRun(
    record: Omit<WorkflowRunRecord, "runId" | "createdAt"> & { runId?: string; createdAt?: string }
  ): Promise<WorkflowRunRecord> {
    const normalized = normalizeWorkflowRun(record);
    await this.redis.lpush(getWorkflowRunKey(normalized.accountId), JSON.stringify(normalized));
    return normalized;
  }

  async listRunsForAccount(accountId: string, limit = 20): Promise<WorkflowRunRecord[]> {
    const safeLimit = Math.max(0, limit);
    const entries = await this.redis.lrange(getWorkflowRunKey(accountId), 0, Math.max(0, safeLimit - 1));
    return entries.map(parseWorkflowRun);
  }
}

let sharedWorkflowRunStore: WorkflowRunStore | null = null;

export function createWorkflowRunStoreFromEnv(env: NodeJS.ProcessEnv = process.env): WorkflowRunStore {
  const shouldUseSharedInstance = env === process.env;
  const redisUrl = getRedisUrlFromEnv(env);

  if (!redisUrl) {
    assertCloudDurabilityRequirement("workflow_run_store", env);
    if (!shouldUseSharedInstance) {
      return new InMemoryWorkflowRunStore();
    }

    if (sharedWorkflowRunStore) {
      return sharedWorkflowRunStore;
    }

    sharedWorkflowRunStore = new InMemoryWorkflowRunStore();
    return sharedWorkflowRunStore;
  }

  if (!shouldUseSharedInstance) {
    return new RedisWorkflowRunStore(createRedisConnection(redisUrl));
  }

  if (sharedWorkflowRunStore) {
    return sharedWorkflowRunStore;
  }

  sharedWorkflowRunStore = new RedisWorkflowRunStore(createRedisConnection(redisUrl));
  return sharedWorkflowRunStore;
}

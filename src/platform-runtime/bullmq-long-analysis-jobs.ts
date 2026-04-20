import process from "node:process";

import { Job, Queue, Worker, type JobState } from "bullmq";
import { Redis } from "ioredis";

import {
  createRequestLogger,
  DEFAULT_LONG_ANALYSIS_JOB_POLL_SECONDS,
  LONG_ANALYSIS_JOB_QUEUE_NAME,
} from "@ludylops/video-analysis-core";
import type {
  AnalysisExecutionContext,
  GetLongAnalysisJobToolOutput,
  LongToolInput,
  LongToolOutput,
  ProgressUpdate,
  StartLongAnalysisJobToolOutput,
  VideoAnalysisServiceLike,
} from "@ludylops/video-analysis-core";
import { getRedisUrlFromEnv } from "./durability-policy.js";
import { createCloudVideoAnalysisService } from "./create-service.js";
import type { LongAnalysisJobs } from "./long-analysis-jobs.js";

type BullMqLongAnalysisProgress = {
  progress: number | null;
  total: number | null;
  message: string | null;
};

type CreateBullMqLongAnalysisJobsOptions = {
  connection: Redis;
  queueName?: string;
};

type CreateBullMqLongAnalysisWorkerOptions = {
  connection?: Redis;
  queueName?: string;
  service?: VideoAnalysisServiceLike;
};

function createRedisConnection(redisUrl: string, maxRetriesPerRequest: number | null): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest,
  });
}

function createProducerConnectionFromEnv(env: NodeJS.ProcessEnv = process.env): Redis | null {
  const redisUrl = getRedisUrlFromEnv(env);
  if (!redisUrl) {
    return null;
  }

  return createRedisConnection(redisUrl, 1);
}

function createWorkerConnectionFromEnv(env: NodeJS.ProcessEnv = process.env): Redis {
  const redisUrl = getRedisUrlFromEnv(env);
  if (!redisUrl) {
    throw new Error("Missing REDIS_URL environment variable for remote long-analysis jobs.");
  }

  return createRedisConnection(redisUrl, null);
}

function normalizeJobState(state: JobState | "unknown"): GetLongAnalysisJobToolOutput["status"] {
  switch (state) {
    case "active":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "delayed":
    case "waiting":
    case "waiting-children":
    case "prioritized":
      return "queued";
    default:
      return "queued";
  }
}

function normalizeJobProgress(progress: unknown): BullMqLongAnalysisProgress | null {
  if (progress === null || progress === undefined) {
    return null;
  }

  if (typeof progress === "number") {
    return {
      progress,
      total: null,
      message: null,
    };
  }

  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return null;
  }

  const payload = progress as Partial<BullMqLongAnalysisProgress>;
  return {
    progress: typeof payload.progress === "number" ? payload.progress : null,
    total: typeof payload.total === "number" ? payload.total : null,
    message: typeof payload.message === "string" ? payload.message : null,
  };
}

function serializeProgress(update: ProgressUpdate): BullMqLongAnalysisProgress {
  return {
    progress: update.progress,
    total: update.total ?? null,
    message: update.message,
  };
}

function createStartJobResponse(jobId: string): StartLongAnalysisJobToolOutput {
  return {
    jobId,
    status: "queued",
    pollTool: "get_long_youtube_video_analysis_job",
    estimatedNextPollSeconds: DEFAULT_LONG_ANALYSIS_JOB_POLL_SECONDS,
  };
}

class BullMqLongAnalysisJobs implements LongAnalysisJobs {
  private readonly queue: Queue;

  constructor(options: CreateBullMqLongAnalysisJobsOptions) {
    this.queue = new Queue(options.queueName ?? LONG_ANALYSIS_JOB_QUEUE_NAME, {
      connection: options.connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  async enqueueLongAnalysis(input: LongToolInput): Promise<StartLongAnalysisJobToolOutput> {
    const job = await this.queue.add("analyze_long_youtube_video", input);
    return createStartJobResponse(String(job.id));
  }

  async getLongAnalysisJob(jobId: string): Promise<GetLongAnalysisJobToolOutput> {
    const job = await Job.fromId<LongToolInput, LongToolOutput>(this.queue, jobId);
    if (!job) {
      return {
        jobId,
        status: "not_found",
        progress: null,
        result: null,
        error: null,
      };
    }

    const state = await job.getState();
    const status = normalizeJobState(state);
    const progress = normalizeJobProgress(job.progress);

    return {
      jobId,
      status,
      progress,
      result: status === "completed" ? job.returnvalue ?? null : null,
      error:
        status === "failed"
          ? {
              message: job.failedReason || "Long analysis job failed.",
              code: null,
              stage: null,
              retryable: null,
            }
          : null,
    };
  }
}

let sharedProducerJobs: LongAnalysisJobs | null = null;

export function createBullMqLongAnalysisJobs(
  options: CreateBullMqLongAnalysisJobsOptions
): LongAnalysisJobs {
  return new BullMqLongAnalysisJobs(options);
}

export function createBullMqLongAnalysisJobsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LongAnalysisJobs | null {
  const shouldUseSharedInstance = env === process.env;

  const connection = createProducerConnectionFromEnv(env);
  if (!connection) {
    return null;
  }

  if (!shouldUseSharedInstance) {
    return createBullMqLongAnalysisJobs({ connection });
  }

  if (sharedProducerJobs) {
    return sharedProducerJobs;
  }

  sharedProducerJobs = createBullMqLongAnalysisJobs({ connection });
  return sharedProducerJobs;
}

export function createBullMqLongAnalysisWorker(
  options: CreateBullMqLongAnalysisWorkerOptions = {}
): Worker<LongToolInput, LongToolOutput> {
  const connection = options.connection ?? createWorkerConnectionFromEnv();
  const service = options.service ?? createCloudVideoAnalysisService();
  const queueName = options.queueName ?? LONG_ANALYSIS_JOB_QUEUE_NAME;

  return new Worker<LongToolInput, LongToolOutput>(
    queueName,
    async (job) => {
      const logger = createRequestLogger("analyze_long_youtube_video");
      await job.updateProgress({
        progress: 0,
        total: 100,
        message: "Queued long analysis job started.",
      });

      const context: AnalysisExecutionContext = {
        logger,
        tool: "analyze_long_youtube_video",
        reportProgress: async (update) => {
          await job.updateProgress(serializeProgress(update));
        },
      };

      return await service.analyzeLong(job.data, context);
    },
    { connection }
  );
}

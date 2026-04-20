import { timingSafeEqual } from "node:crypto";
import process from "node:process";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import express, { type NextFunction, type Request, type Response } from "express";
import { Redis } from "ioredis";

import { LONG_ANALYSIS_JOB_QUEUE_NAME } from "@ludylops/video-analysis-core";

export type DashboardServerConfig = {
  host: string;
  port: number;
};

export type DashboardAuthConfig = {
  username: string;
  password: string;
};

export type QueueDashboardApp = {
  app: express.Express;
  close: () => Promise<void>;
  config: DashboardServerConfig;
  queueNames: string[];
};

function sanitizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getDashboardServerConfig(
  env: NodeJS.ProcessEnv = process.env
): DashboardServerConfig {
  const rawPort = env.PORT || env.ADMIN_PORT || "3020";
  const parsedPort = Number(rawPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3020;
  const host = env.ADMIN_HOST || env.HOST || (env.PORT ? "0.0.0.0" : "127.0.0.1");

  return { host, port };
}

export function getDashboardQueueNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const rawNames = sanitizeEnvValue(env.BULL_BOARD_QUEUE_NAMES);
  if (!rawNames) {
    return [sanitizeEnvValue(env.LONG_ANALYSIS_JOB_QUEUE_NAME) || LONG_ANALYSIS_JOB_QUEUE_NAME];
  }

  const queueNames = rawNames
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return queueNames.length > 0 ? queueNames : [LONG_ANALYSIS_JOB_QUEUE_NAME];
}

export function getDashboardReadOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = sanitizeEnvValue(env.BULL_BOARD_READ_ONLY);
  return raw ? raw.toLowerCase() !== "false" : true;
}

export function getDashboardAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): DashboardAuthConfig {
  const username = sanitizeEnvValue(env.ADMIN_USERNAME);
  if (!username) {
    throw new Error("Missing ADMIN_USERNAME environment variable for the BullMQ dashboard.");
  }

  const password = sanitizeEnvValue(env.ADMIN_PASSWORD);
  if (!password) {
    throw new Error("Missing ADMIN_PASSWORD environment variable for the BullMQ dashboard.");
  }

  return { username, password };
}

export function getDashboardRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const redisUrl = sanitizeEnvValue(env.REDIS_URL);
  if (redisUrl) {
    return redisUrl;
  }

  const host = sanitizeEnvValue(env.REDIS_HOST);
  if (!host) {
    throw new Error("Missing REDIS_URL or REDIS_HOST environment variable for the BullMQ dashboard.");
  }

  const port = sanitizeEnvValue(env.REDIS_PORT) || "6379";
  return `redis://${host}:${port}`;
}

export function parseBasicAuthHeader(headerValue: string | undefined): DashboardAuthConfig | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, encoded] = headerValue.split(" ", 2);
  if (!scheme || !encoded || scheme.toLowerCase() !== "basic") {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function isDashboardRequestAuthorized(
  headerValue: string | undefined,
  auth: DashboardAuthConfig
): boolean {
  const credentials = parseBasicAuthHeader(headerValue);
  if (!credentials) {
    return false;
  }

  return safeEqual(credentials.username, auth.username) && safeEqual(credentials.password, auth.password);
}

function createDashboardAuthMiddleware(auth: DashboardAuthConfig) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (isDashboardRequestAuthorized(request.headers.authorization, auth)) {
      next();
      return;
    }

    response.setHeader("www-authenticate", 'Basic realm="youtube-video-analyzer-bull-board"');
    response.status(401).type("text/plain; charset=utf-8").send("Authentication required.");
  };
}

export function createQueueDashboardApp(
  env: NodeJS.ProcessEnv = process.env
): QueueDashboardApp {
  const auth = getDashboardAuthConfig(env);
  const config = getDashboardServerConfig(env);
  const queueNames = getDashboardQueueNames(env);
  const readOnlyMode = getDashboardReadOnly(env);
  const redisUrl = getDashboardRedisUrl(env);

  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
  });
  const queues = queueNames.map(
    (queueName) =>
      new Queue(queueName, {
        connection,
      })
  );

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue, { readOnlyMode })),
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: "YouTube Video Analyzer Queue Dashboard",
        hideRedisDetails: true,
      },
    },
  });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  app.use(createDashboardAuthMiddleware(auth));

  app.get("/", (_request, response) => {
    response.redirect("/admin/queues");
  });

  app.use("/admin/queues", serverAdapter.getRouter());

  return {
    app,
    config,
    queueNames,
    close: async () => {
      await Promise.all(queues.map((queue) => queue.close()));
      await connection.quit();
    },
  };
}

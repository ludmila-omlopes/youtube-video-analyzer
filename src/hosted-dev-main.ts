import "dotenv/config";

import type { IncomingHttpHeaders } from "node:http";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import process from "node:process";

import { resolveHttpSurfaceRoute, type HttpSurfaceRouteHandler } from "./http/http-surface.js";
import {
  assertHostedRuntimeReady,
  getHostedRuntimeStartupSummary,
} from "./platform-runtime/index.js";

export function getHostedServerConfig(
  env: NodeJS.ProcessEnv = process.env
): { host: string; port: number } {
  const rawPort = env.PORT || env.HOSTED_DEV_PORT || "3010";
  const parsedPort = Number(rawPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3010;
  const host = env.HOSTED_DEV_HOST || env.HOST || (env.PORT ? "0.0.0.0" : "127.0.0.1");

  return { host, port };
}

function pickHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function pickForwardedValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

export function getPublicOriginFromHeaders(
  headers: IncomingHttpHeaders,
  fallbackHost: string
): string {
  const forwardedProto = pickForwardedValue(pickHeaderValue(headers["x-forwarded-proto"]));
  const forwardedHost = pickForwardedValue(pickHeaderValue(headers["x-forwarded-host"]));
  const host = forwardedHost || pickHeaderValue(headers.host) || fallbackHost;
  const protocol = forwardedProto || "http";

  return `${protocol}://${host}`;
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

function toWebRequest(request: IncomingMessage, body: Buffer | undefined, origin: string): Request {
  const url = new URL(request.url || "/", origin);
  const method = request.method || "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" || !body ? undefined : new Uint8Array(body),
  });
}

async function writeWebResponse(response: Response, serverResponse: ServerResponse): Promise<void> {
  serverResponse.statusCode = response.status;
  serverResponse.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    serverResponse.setHeader(key, key === "set-cookie" ? response.headers.getSetCookie() : value);
  });

  if (!response.body) {
    serverResponse.end();
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  serverResponse.end(body);
}

export function resolveRoute(pathname: string, method: string): HttpSurfaceRouteHandler | Response {
  return resolveHttpSurfaceRoute(pathname, method);
}

async function handleNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  origin: string
): Promise<void> {
  try {
    const body = await readRequestBody(request);
    const webRequest = toWebRequest(request, body, origin);
    const resolved = resolveRoute(new URL(webRequest.url).pathname, webRequest.method);
    const webResponse = resolved instanceof Response ? resolved : await resolved(webRequest);
    await writeWebResponse(webResponse, response);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(message);
  }
}

export function createHostedDevServer() {
  const { host, port } = getHostedServerConfig();

  return createHttpServer((request, response) => {
    const origin = getPublicOriginFromHeaders(request.headers, `${host}:${port}`);
    void handleNodeRequest(request, response, origin);
  });
}

function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}, closing hosted HTTP server`);
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }

      process.exit();
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

export async function main(): Promise<void> {
  const hostedRuntimeRole = assertHostedRuntimeReady();
  const { host, port } = getHostedServerConfig();
  const server = createHostedDevServer();
  installShutdownHandlers(server);

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      console.log(`Hosted HTTP server listening on http://${host}:${port}`);
      console.log(`MCP endpoint: http://${host}:${port}/api/mcp`);
      if (hostedRuntimeRole) {
        for (const line of getHostedRuntimeStartupSummary()) {
          console.log(line);
        }
      }
      resolve();
    });
  });
}

import "dotenv/config";

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { handleMcpHttpRequest } from "../http/mcp.js";

type RouteHandler = (request: Request) => Promise<Response>;

const HOST = process.env.HOSTED_DEV_HOST || "127.0.0.1";
const PORT = Number(process.env.HOSTED_DEV_PORT || "3010");

function getOrigin(request: IncomingMessage): string {
  const host = request.headers.host ?? `${HOST}:${PORT}`;
  return `http://${host}`;
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

function toWebRequest(request: IncomingMessage, body: Buffer | undefined): Request {
  const url = new URL(request.url || "/", getOrigin(request));
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

function methodNotAllowed(allowed: string[]): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow: allowed.join(", "),
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export function resolveRoute(pathname: string, method: string): RouteHandler | Response {
  if (pathname === "/api/mcp") {
    if (method === "GET") {
      return handleMcpHttpRequest;
    }

    if (method === "POST") {
      return handleMcpHttpRequest;
    }

    if (method === "DELETE") {
      return handleMcpHttpRequest;
    }

    return methodNotAllowed(["GET", "POST", "DELETE"]);
  }

  if (pathname === "/" || pathname === "") {
    return async () =>
      new Response(
        JSON.stringify({
          ok: true,
          mcpUrl: `http://${HOST}:${PORT}/api/mcp`,
        }),
        {
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
  }

  return notFound();
}

async function handleNodeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readRequestBody(request);
    const webRequest = toWebRequest(request, body);
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
  return createHttpServer((request, response) => {
    void handleNodeRequest(request, response);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createHostedDevServer();
  server.listen(PORT, HOST, () => {
    console.log(`Hosted local server listening on http://${HOST}:${PORT}`);
    console.log(`MCP endpoint: http://${HOST}:${PORT}/api/mcp`);
  });
}

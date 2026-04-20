import { cookies } from "next/headers";
import type { ApiErrorBody } from "./types";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3010";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type FetchOpts = {
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  body?: unknown;
  query?: Record<string, string | undefined>;
};

export async function serverFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const url = new URL(path, BACKEND_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      cookie: cookieHeader,
      accept: "application/json",
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, body, body?.error?.message ?? `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

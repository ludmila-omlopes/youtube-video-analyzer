"use client";

import type { ApiErrorBody } from "./types";

function resolveBrowserUrl(path: string): URL {
  const origin = window.location.origin;
  if (path.startsWith("/api/v1/")) {
    return new URL(`/api/proxy/v1/${path.slice("/api/v1/".length)}`, origin);
  }

  if (path === "/api/v1") {
    return new URL("/api/proxy/v1", origin);
  }

  if (path.startsWith("/api/web/")) {
    return new URL(`/api/proxy/web/${path.slice("/api/web/".length)}`, origin);
  }

  if (path === "/api/web") {
    return new URL("/api/proxy/web", origin);
  }

  return new URL(path, origin);
}

export class BrowserApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
    message: string
  ) {
    super(message);
    this.name = "BrowserApiError";
  }
}

export async function browserFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const { query, headers, ...rest } = init;
  const url = resolveBrowserUrl(path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    ...rest,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // non-JSON
    }
    throw new BrowserApiError(res.status, body, body?.error?.message ?? `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

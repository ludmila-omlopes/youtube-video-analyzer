import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { SessionResponse } from "./types";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3010";

export const getSession = cache(async (): Promise<SessionResponse | null> => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/web/session`, {
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (res.status === 401 || res.status === 503) {
    return null;
  }

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as SessionResponse;
});

export async function requireSession(): Promise<SessionResponse> {
  const session = await getSession();
  if (!session || !session.account) {
    redirect("/login");
  }
  return session;
}

export function getRequestOrigin(reqHeaders: Awaited<ReturnType<typeof headers>>): string {
  const proto = reqHeaders.get("x-forwarded-proto") ?? "http";
  const host = reqHeaders.get("host") ?? "localhost:3001";
  return `${proto}://${host}`;
}

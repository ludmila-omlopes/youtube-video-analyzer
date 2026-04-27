import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = process.env.OAUTH_HOSTED_ACCESS_COOKIE ?? "ya_session";

const PROTECTED_PREFIXES = ["/dashboard", "/analyze", "/history", "/billing"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/analyze/:path*", "/history/:path*", "/billing/:path*"],
};

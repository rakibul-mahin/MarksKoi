import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

/**
 * Optimistic gate only: redirects visitors without any session cookie away from protected areas
 * and forwards the requested path for post-login redirects. Real authentication and
 * authorization happen in the server layer (src/server/auth/guards.ts) on every request.
 * Also sets the per-request Content-Security-Policy nonce for HTML pages.
 */
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];
const PROTECTED = ["/student", "/courses", "/faculty", "/admin"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Fresh nonce per request: Next.js applies it to its own scripts during server rendering.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-syncscore-path", pathname + search);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt).*)"],
};

import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware auth guard.
 * Melindungi semua route dashboard dari akses tanpa session.
 * Route publik (login, register, API reports) tidak memerlukan session.
 */

const PUBLIC_PATHS = ["/login", "/register"];
const PUBLIC_PATH_PREFIXES = ["/api/reports"];
const SESSION_COOKIE_NAME = "admin_web_session";

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function isSessionValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const payloadBase64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payloadBase64.length % 4;
    const padded = pad ? payloadBase64 + "=".repeat(4 - pad) : payloadBase64;
    
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson);
    
    if (!payload.userId || !payload.exp || payload.exp < Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip file statis dan Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Route publik: tidak perlu session
  if (isPublicPath(pathname)) {
    // Intercept clear_session untuk hapus stale cookie (menghindari redirect loop)
    if (request.nextUrl.searchParams.get("clear_session") === "1") {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }

    // Jika user sudah login dan coba akses login/register, redirect ke dashboard
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (isSessionValid(sessionCookie?.value) && (pathname === "/login" || pathname === "/register")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Route protected: cek session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!isSessionValid(sessionCookie?.value)) {
    const loginUrl = new URL("/login", request.url);
    // Hapus cookie invalid jika ada untuk mencegah loop tak berujung
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Session ada — lanjutkan (validasi detil dilakukan di server component)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match semua request path kecuali:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};

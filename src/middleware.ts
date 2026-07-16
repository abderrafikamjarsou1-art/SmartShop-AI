import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Routes only for guests. Authenticated users get bounced to /dashboard. */
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

/** Route prefixes that require authentication. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/products",
  "/inventory",
  "/sales",
  "/customers",
  "/suppliers",
  "/expenses",
  "/purchases",
  "/reports",
  "/invoices",
  "/analytics",
  "/ai",
  "/settings",
  "/admin",
  "/onboarding",
];

export async function middleware(request: NextRequest) {
  // 1. Refresh session (must run on every matched request)
  const { supabaseResponse, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  // 2. Guests trying to access the app -> /login (with return path)
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 3. Authenticated users on auth pages -> /dashboard
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 4. Always return supabaseResponse so refreshed cookies persist
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and images.
     * Auth callback routes ARE matched so sessions get set correctly.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "./database.types";
import { COMPLETE_PROFILE_PATH, PROFILE_OK_COOKIE, isOpenPath } from "@/lib/profile-gate";

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

/** Refreshes the Supabase session cookie and guards private areas. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the token.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const isSignedIn = Boolean(userId);

  const { pathname, search } = request.nextUrl;
  if (!isSignedIn && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // Signed-in users must complete their profile (avatar, name, phone) before using the app.
  const isNavigation = request.method === "GET" || request.method === "HEAD";
  if (userId && isNavigation && !isOpenPath(pathname) && request.cookies.get(PROFILE_OK_COOKIE)?.value !== userId) {
    const { data: complete, error } = await supabase.rpc("my_profile_complete");
    if (!error && complete === false) {
      const url = request.nextUrl.clone();
      url.pathname = COMPLETE_PROFILE_PATH;
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
    if (complete) {
      response.cookies.set(PROFILE_OK_COOKIE, userId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    }
  }

  return response;
}

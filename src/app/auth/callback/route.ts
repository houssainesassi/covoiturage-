import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

/** PKCE code exchange for email confirmation, password recovery and email change links. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const url = new URL(next, origin);
      if (next === "/dashboard") url.searchParams.set("toast", "confirmed");
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.redirect(new URL("/auth/error", origin));
}

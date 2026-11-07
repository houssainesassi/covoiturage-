import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidSecretKey, serverEnv } from "@/lib/env.server";

/**
 * Fallback scheduler (Vercel Cron) for when pg_cron is not enabled:
 * sends "trip approaching" reminders and auto-completes past trips.
 */
export async function GET(request: NextRequest) {
  if (!serverEnv.cronSecret || request.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasValidSecretKey()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY missing" }, { status: 500 });
  const supabase = createAdminClient();
  const [reminders, completed] = await Promise.all([supabase.rpc("send_trip_reminders"), supabase.rpc("complete_past_trips")]);
  if (reminders.error || completed.error) {
    return NextResponse.json({ error: reminders.error?.message ?? completed.error?.message }, { status: 500 });
  }
  return NextResponse.json({ reminders: reminders.data, completed: completed.data });
}

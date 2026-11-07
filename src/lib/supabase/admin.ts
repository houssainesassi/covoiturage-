import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { serverEnv, hasValidSecretKey } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Privileged client (bypasses RLS). Only for trusted server jobs such as the
 * cron endpoint. Never expose to the browser.
 */
export function createAdminClient() {
  if (!hasValidSecretKey()) {
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }
  return createClient<Database>(env.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

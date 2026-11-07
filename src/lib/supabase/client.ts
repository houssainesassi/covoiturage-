"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client (singleton). Used for Realtime, Storage uploads and chat. */
export function createClient() {
  if (!client) {
    client = createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
  }
  return client;
}

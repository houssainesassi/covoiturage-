import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { isSupabaseConfigured } from "@/lib/env";
import type { ServerSupabase } from "@/lib/supabase/server";

type Failure = Extract<ActionResult, { ok: false }>;
type Authed = { error: Failure } | { supabase: ServerSupabase; userId: string };

/** Supabase client + verified user id, or an error result. */
export async function authed(): Promise<Authed> {
  if (!isSupabaseConfigured()) return { error: fail("not_configured") as Failure };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: fail("not_authenticated") as Failure };
  return { supabase, userId: data.user.id };
}

export function result(error: { message?: string; code?: string } | null): ActionResult {
  return error ? fail(toErrorCode(error)) : { ok: true };
}

/**
 * Saves private profile fields. Not an upsert: PostgREST upserts also write `id`,
 * and users have no UPDATE privilege on that column.
 * The row normally exists already (created by the signup trigger).
 */
export async function savePrivateProfile(supabase: ServerSupabase, userId: string, fields: { phone: string; date_of_birth?: string | null }) {
  const { data, error } = await supabase.from("profile_private").update(fields).eq("id", userId).select("id");
  if (error || data?.length) return { error };
  const { error: insertError } = await supabase.from("profile_private").insert({ id: userId, ...fields });
  return { error: insertError };
}

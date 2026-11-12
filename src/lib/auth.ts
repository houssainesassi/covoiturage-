import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./env";
import { createClient } from "./supabase/server";

/**
 * Verified current user (validated with the Auth server), or null.
 * A session whose email is not confirmed counts as signed out: with "Confirm
 * email" on, Supabase never issues one, so this is only a second line of defence.
 */
export const getUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email_confirmed_at ? data.user : null;
});

export const getProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
});

export async function requireUser(next = "/dashboard") {
  const user = await getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Authorization is decided by the database role, never by the client. */
export async function requireAdmin() {
  const user = await requireUser("/admin");
  const profile = await getProfile();
  if (!profile || profile.role !== "admin" || profile.status !== "active") redirect("/dashboard");
  return { user, profile };
}

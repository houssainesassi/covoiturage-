import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).d.completeProfile.title };
}

export default async function CompleteProfilePage({ searchParams }: PageProps<"/auth/complete-profile">) {
  const sp = await searchParams;
  const rawNext = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/");
  const next = rawNext.startsWith("/auth") ? "/" : rawNext;
  const user = await requireUser(`/auth/complete-profile?next=${encodeURIComponent(next)}`);
  const supabase = await createClient();
  let profile = await getProfile();
  if (!profile) {
    // Accounts created before migration 20 may have no profile row: create it from the
    // sign-up details (never overwrites). Without migration 20 the call fails and the
    // page behaves as before.
    const { data: created } = await supabase.rpc("ensure_my_profile");
    if (created) profile = (await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()).data;
  }
  const [{ data: priv }, { data: complete }] = await Promise.all([
    supabase.from("profile_private").select("phone").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_profile_complete"),
  ]);
  if (complete) redirect(next);
  const { d } = await getI18n();
  return (
    <AuthShell title={d.completeProfile.title} subtitle={d.completeProfile.subtitle}>
      <CompleteProfileForm userId={user.id} next={next} fullName={profile?.full_name ?? ""} avatarPath={profile?.avatar_path ?? null} phone={priv?.phone ?? ""} />
    </AuthShell>
  );
}

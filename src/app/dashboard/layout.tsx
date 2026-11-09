import { ShieldAlert } from "lucide-react";
import { requireUser, getProfile } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await requireUser();
  const profile = await getProfile();
  const { d } = await getI18n();
  let suspendedReason: string | null = null;
  if (profile?.status === "suspended") {
    const supabase = await createClient();
    const { data } = await supabase.from("profile_private").select("suspended_reason").eq("id", profile.id).maybeSingle();
    suspendedReason = data?.suspended_reason ?? null;
  }
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-10">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <DashboardSidebar isAdmin={profile?.role === "admin"} />
      </aside>
      <div className="min-w-0">
        {profile?.status === "suspended" && (
          <div className="mb-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
            <ShieldAlert className="size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{d.dashboard.suspendedTitle}</p>
              <p className="text-sm">{d.dashboard.suspendedBody}{suspendedReason ? ` (${suspendedReason})` : ""}</p>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

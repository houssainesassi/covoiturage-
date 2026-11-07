import Link from "next/link";
import { PlusCircle, Search } from "lucide-react";
import { getProfile, getUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "./logo";
import { LanguageSwitcher } from "./language-switcher";
import { MessagesBadge, NotificationBell } from "./realtime-badges";
import { MobileMenu, UserMenu } from "./user-menu";

export async function Navbar() {
  const { d } = await getI18n();
  const user = await getUser();
  const profile = user ? await getProfile() : null;
  let unreadNotifications = 0;
  let unreadMessages = 0;
  if (user) {
    const supabase = await createClient();
    const [n, m] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      supabase.rpc("unread_message_count"),
    ]);
    unreadNotifications = n.count ?? 0;
    unreadMessages = typeof m.data === "number" ? m.data : 0;
  }
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo name={d.common.appName} />
        <nav className="ms-6 hidden items-center gap-1 md:flex">
          <Link href="/search" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Search className="size-4" aria-hidden /> {d.nav.search}
          </Link>
          <Link href="/dashboard/trips/new" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <PlusCircle className="size-4" aria-hidden /> {d.nav.publish}
          </Link>
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <div className="hidden md:block"><LanguageSwitcher /></div>
          {user ? (
            <>
              <MessagesBadge userId={user.id} initial={unreadMessages} />
              <NotificationBell userId={user.id} initial={unreadNotifications} />
              <UserMenu
                name={profile?.full_name || user.email || ""}
                isAdmin={profile?.role === "admin"}
                avatar={<Avatar path={profile?.avatar_path} name={profile?.full_name || user.email} size="sm" />}
              />
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/auth/login" className={buttonClass("ghost", "sm")}>{d.common.login}</Link>
              <Link href="/auth/register" className={buttonClass("primary", "sm")}>{d.common.register}</Link>
            </div>
          )}
          <MobileMenu signedIn={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}

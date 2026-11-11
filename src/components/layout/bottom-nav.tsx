"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, PlusCircle, Search, User } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Pages with their own bottom action bar or full-screen form. */
const HIDDEN_ON = ["/auth", "/trips/", "/rentals/", "/dashboard/messages/", "/admin"];

/** Phone navigation: the app's main actions, always one thumb away. */
export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const { d } = useI18n();
  const path = usePathname();
  if (HIDDEN_ON.some((p) => path.startsWith(p)) || path === "/dashboard/trips/new" || /^\/dashboard\/trips\/[^/]+\/edit$/.test(path)) return null;
  const items = [
    { href: "/search", label: d.common.search, icon: Search, active: path === "/search" },
    { href: "/dashboard/trips/new", label: d.common.publish, icon: PlusCircle, active: path === "/dashboard/trips/new" },
    { href: "/dashboard/bookings", label: d.nav.myBookings, icon: CalendarCheck, active: path === "/dashboard/bookings" },
    signedIn
      ? { href: "/dashboard", label: d.nav.account, icon: User, active: path === "/dashboard" }
      : { href: "/auth/login", label: d.common.login, icon: User, active: false },
  ];
  return (
    <nav aria-label={d.nav.menu} className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <ul className="grid grid-cols-4">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={i.active ? "page" : undefined} className={cn("flex h-[4.25rem] flex-col items-center justify-center gap-1 px-1 text-center text-xs font-semibold leading-tight transition", i.active ? "text-brand-700" : "text-slate-600 active:text-brand-700")}>
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition", i.active && "bg-brand-100")}><i.icon className="size-5" aria-hidden /></span>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

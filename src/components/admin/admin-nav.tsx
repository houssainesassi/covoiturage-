"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarCheck, Flag, KeyRound, LayoutDashboard, Route, ShieldCheck, Star, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** Dark sidebar on large screens, a sticky scrollable strip of pills on smaller ones. */
export function AdminNav({ openReports, rentals = false }: { openReports: number; rentals?: boolean }) {
  const { d, locale } = useI18n();
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (nav && nav.scrollWidth > nav.clientWidth) nav.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  const groups: { title: string | null; items: { href: string; label: string; icon: typeof Users; exact?: boolean; count?: number }[] }[] = [
    { title: null, items: [{ href: "/admin", label: d.admin.overview, icon: BarChart3, exact: true }] },
    {
      title: d.admin.management,
      items: [
        { href: "/admin/users", label: d.admin.users, icon: Users },
        { href: "/admin/trips", label: d.admin.trips, icon: Route },
        { href: "/admin/bookings", label: d.admin.bookings, icon: CalendarCheck },
      ],
    },
    {
      title: d.admin.moderation,
      items: [
        { href: "/admin/reports", label: d.admin.reports, icon: Flag, count: openReports },
        { href: "/admin/reviews", label: d.admin.reviews, icon: Star },
        ...(rentals ? [{ href: "/admin/rentals", label: d.rentals.title, icon: KeyRound }] : []),
      ],
    },
  ];
  const link = "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition lg:gap-3 lg:py-2.5";

  return (
    <div className="lg:rounded-[var(--radius-card)] lg:bg-brand-950 lg:p-3 lg:shadow-[var(--shadow-card)]">
      <p className="hidden items-center gap-2.5 px-3 pb-4 pt-2 font-bold text-white lg:flex">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600"><ShieldCheck className="size-4.5" aria-hidden /></span>
        {d.admin.title}
      </p>
      <nav ref={ref} aria-label={d.admin.sections} className="wf-scroll-x flex gap-1.5 overflow-x-auto lg:block lg:space-y-4 lg:overflow-visible">
        {groups.map((g, i) => (
          <div key={i} className="flex gap-1.5 lg:block lg:space-y-0.5">
            {g.title && <p className="hidden px-3 pb-1 text-xs font-semibold text-brand-300 lg:block">{g.title}</p>}
            {g.items.map((item) => {
              const active = item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(link, active ? "bg-brand-600 text-white lg:bg-white lg:font-semibold lg:text-brand-900" : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900 lg:border-0 lg:bg-transparent lg:text-brand-100 lg:hover:bg-white/10 lg:hover:text-white")}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                  {item.count ? <span className="ms-auto rounded-full bg-accent-600 px-1.5 text-xs font-bold text-white tabular-nums">{formatNumber(item.count, locale)}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="flex lg:mt-2 lg:block lg:border-t lg:border-white/10 lg:pt-3">
          <Link href="/dashboard" className={cn(link, "border border-slate-200 bg-white text-slate-600 hover:text-slate-900 lg:border-0 lg:bg-transparent lg:text-brand-100 lg:hover:bg-white/10 lg:hover:text-white")}>
            <LayoutDashboard className="size-4 shrink-0" aria-hidden />
            {d.nav.dashboard}
          </Link>
        </div>
      </nav>
    </div>
  );
}

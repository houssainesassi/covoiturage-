"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarCheck, Car, CarFront, LayoutDashboard, MessageCircle, Settings, Star, User, Wallet, Shield } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function DashboardSidebar({ isAdmin }: { isAdmin: boolean }) {
  const { d } = useI18n();
  const path = usePathname();
  const groups = [
    { title: null, items: [{ href: "/dashboard", label: d.nav.overview, icon: LayoutDashboard, exact: true }] },
    { title: d.nav.asPassenger, items: [{ href: "/dashboard/bookings", label: d.nav.myBookings, icon: CalendarCheck }] },
    {
      title: d.nav.asDriver,
      items: [
        { href: "/dashboard/trips", label: d.nav.myTrips, icon: Car },
        { href: "/dashboard/vehicles", label: d.nav.vehicles, icon: CarFront },
        { href: "/dashboard/earnings", label: d.nav.earnings, icon: Wallet },
      ],
    },
    {
      title: d.nav.account,
      items: [
        { href: "/dashboard/messages", label: d.nav.messages, icon: MessageCircle },
        { href: "/dashboard/notifications", label: d.nav.notifications, icon: Bell },
        { href: "/dashboard/reviews", label: d.nav.reviews, icon: Star },
        { href: "/dashboard/profile", label: d.nav.profile, icon: User },
        { href: "/dashboard/settings", label: d.nav.settings, icon: Settings },
        ...(isAdmin ? [{ href: "/admin", label: d.nav.admin, icon: Shield }] : []),
      ],
    },
  ];
  return <SideNav groups={groups} path={path} />;
}

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };
function SideNav({ groups, path }: { groups: { title: string | null; items: Item[] }[]; path: string }) {
  const isActive = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0 lg:pb-0">
      {groups.map((g, gi) => (
        <div key={gi} className="flex gap-1 lg:block lg:space-y-0.5">
          {g.title && <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 lg:block">{g.title}</p>}
          {g.items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={isActive(i) ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
                isActive(i) ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900",
              )}
            >
              <i.icon className="size-4" />
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

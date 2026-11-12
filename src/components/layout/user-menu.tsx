"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarCheck, Car, LayoutDashboard, LogOut, Settings, Shield, User, Menu, X, Search, PlusCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { logoutAction } from "@/actions/auth";
import { LanguageSwitcher } from "./language-switcher";

type Props = { name: string; avatar: React.ReactNode; isAdmin: boolean };

export function UserMenu({ name, avatar, isAdmin }: Props) {
  const { d } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const links = [
    { href: "/dashboard", label: d.nav.dashboard, icon: LayoutDashboard },
    { href: "/dashboard/bookings", label: d.nav.myBookings, icon: CalendarCheck },
    { href: "/dashboard/trips", label: d.nav.myTrips, icon: Car },
    { href: "/dashboard/profile", label: d.nav.profile, icon: User },
    { href: "/dashboard/settings", label: d.nav.settings, icon: Settings },
    ...(isAdmin ? [{ href: "/admin", label: d.nav.admin, icon: Shield }] : []),
  ];
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-brand-200" aria-expanded={open} aria-label={d.nav.account}>
        {avatar}
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-lift)]">
          <p className="truncate border-b border-slate-100 px-4 py-3 text-sm font-semibold">{name}</p>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <l.icon className="size-4 text-slate-400" aria-hidden /> {l.label}
            </Link>
          ))}
          <form action={logoutAction} className="border-t border-slate-100">
            <button type="submit" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
              <LogOut className="size-4" aria-hidden /> {d.common.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const { d } = useI18n();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-xl p-2 text-slate-700 hover:bg-slate-100" aria-expanded={open} aria-label={d.nav.menu}>
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-16 z-40 border-b border-slate-200 bg-white px-4 pb-5 pt-2 shadow-lg">
          <nav className="flex flex-col">
            <Link href="/search" className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-slate-50"><Search className="size-5 text-brand-600" />{d.nav.search}</Link>
            <Link href="/dashboard/trips/new" className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-slate-50"><PlusCircle className="size-5 text-brand-600" />{d.nav.publish}</Link>
            <Link href="/help" className="rounded-xl px-3 py-3 font-medium hover:bg-slate-50">{d.nav.help}</Link>
          </nav>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <LanguageSwitcher />
            {!signedIn && (
              <div className="flex gap-2">
                <Link href="/auth/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">{d.common.login}</Link>
                <Link href="/auth/register" className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">{d.common.register}</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

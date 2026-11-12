"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CalendarDays, Search, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { tunisDateKey } from "@/lib/i18n/format";
import type { LocationLite } from "@/lib/location-lite";
import { cn } from "@/lib/utils";
import { LocationCombobox } from "./location-combobox";

export function SearchForm({
  locations,
  initial,
  compact,
}: {
  locations: LocationLite[];
  initial?: { from?: string; to?: string; date?: string; seats?: number };
  compact?: boolean;
}) {
  const { d } = useI18n();
  const router = useRouter();
  const bySlug = (s?: string) => locations.find((l) => l.slug === s) ?? null;
  const [from, setFrom] = useState<LocationLite | null>(bySlug(initial?.from));
  const [to, setTo] = useState<LocationLite | null>(bySlug(initial?.to));
  const [date, setDate] = useState(initial?.date ?? "");
  const [seats, setSeats] = useState(initial?.seats ?? 1);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (from) p.set("from", from.slug);
    if (to) p.set("to", to.slug);
    if (date) p.set("date", date);
    if (seats > 1) p.set("seats", String(seats));
    router.push(`/search${p.size ? `?${p}` : ""}`);
  };

  return (
    <form onSubmit={submit} className={cn("grid grid-cols-2 gap-2 rounded-2xl bg-white p-2 text-slate-900 shadow-[var(--shadow-lift)] ring-1 ring-slate-200", compact ? "lg:grid-cols-[1fr_auto_1fr_10rem_7rem_auto]" : "lg:grid-cols-[1fr_auto_1fr_11rem_8rem_auto]")} role="search">
      <div className="col-span-2 lg:col-span-1"><LocationCombobox id="search-from" locations={locations} value={from} onChange={setFrom} placeholder={d.search.placeholderFrom} inputClassName="border-transparent bg-slate-50" /></div>
      <button type="button" onClick={() => { setFrom(to); setTo(from); }} className="col-span-2 -my-3 mx-auto relative z-10 flex size-10 items-center border border-slate-200 bg-white shadow-sm lg:col-span-1 lg:my-0 lg:border-0 lg:shadow-none justify-center self-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={d.search.swap}>
        <ArrowLeftRight className="size-4 rotate-90 lg:rotate-0" />
      </button>
      <div className="col-span-2 lg:col-span-1"><LocationCombobox id="search-to" locations={locations} value={to} onChange={setTo} placeholder={d.search.placeholderTo} inputClassName="border-transparent bg-slate-50" /></div>
      <label className="relative">
        <span className="sr-only">{d.search.date}</span>
        <CalendarDays className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-brand-600" aria-hidden />
        <input type="date" min={tunisDateKey()} value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-full rounded-xl border border-transparent bg-slate-50 ps-10 pe-2 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
      </label>
      <label className="relative">
        <span className="sr-only">{d.search.passengers}</span>
        <Users className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-brand-600" aria-hidden />
        <select value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="h-12 w-full appearance-none rounded-xl border border-transparent bg-slate-50 ps-10 pe-2 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <button type="submit" className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 font-bold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98] lg:col-span-1">
        <Search className="size-5" aria-hidden /> {d.search.submit}
      </button>
    </form>
  );
}

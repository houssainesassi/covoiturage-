import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Banknote, CalendarDays, Car, CirclePlus, MapPin, MessageCircle, SearchX, Users } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import { artFor, routeFor, type Direction } from "@/lib/destinations";
import { fmt, plural, tunisDateKey, tunisTomorrowKey } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { searchRowToCard, withDriverPhones } from "@/lib/queries";
import { routeLabel } from "@/lib/notifications";
import { DestinationArt } from "@/components/destinations/art";
import { TripCard } from "@/components/trips/trip-card";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const LIMIT = 24;

async function load(slug: string) {
  const locations = await getLocations();
  const dest = locations.find((l) => l.slug === slug);
  const home = locations.find((l) => l.slug === site.homeCitySlug) ?? locations[0];
  return { locations, dest, home };
}

export async function generateMetadata({ params }: PageProps<"/destinations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [{ d, locale }, { dest }] = await Promise.all([getI18n(), load(slug)]);
  return { title: dest ? fmt(d.dest.metaTitle, { city: locName(dest, locale) }) : d.notFound.title };
}

export default async function DestinationPage({ params, searchParams }: PageProps<"/destinations/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [{ d, locale }, { locations, dest, home }] = await Promise.all([getI18n(), load(slug)]);
  if (!dest || !home) notFound();

  const dir: Direction = one("dir") === "back" ? "back" : "go";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one("date") ?? "") ? one("date")! : undefined;
  const seats = Math.min(Math.max(Number(one("seats")) || 1, 1), 8);
  const { origin, destination } = routeFor(home, dest, dir);
  const isHome = home.id === dest.id;
  const name = (l: typeof origin) => (l ? locName(l, locale) : d.dest.anywhere);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_trips", {
    p_origin_id: origin?.id ?? null,
    p_destination_id: destination?.id ?? null,
    p_date: date ?? null,
    p_seats: seats,
    p_sort: "departure",
    p_limit: LIMIT,
    p_offset: 0,
  });
  const rows = await withDriverPhones(supabase, (data ?? []).map(searchRowToCard));
  const total = Number(data?.[0]?.total_count ?? 0);
  const byId = new Map(locations.map((l) => [l.id, l]));

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur = { dir: dir === "back" ? "back" : undefined, date, seats: seats > 1 ? String(seats) : undefined, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/destinations/${dest.slug}${p.size ? `?${p}` : ""}`;
  };
  const today = tunisDateKey();
  const tomorrow = tunisTomorrowKey();
  const publishHref = `/dashboard/trips/new?${new URLSearchParams({ ...(origin ? { from: origin.slug } : {}), ...(destination ? { to: destination.slug } : {}) })}`;
  const dirLabel = (k: Direction) => {
    const r = routeFor(home, dest, k);
    return routeLabel(name(r.origin), name(r.destination), locale);
  };

  const chip = (active: boolean) => cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition", active ? "bg-brand-600 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-brand-300");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-4 sm:px-6 sm:pt-8">
      {/* Header: picture + route */}
      <header className="relative overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] ring-1 ring-slate-200/70">
        <div className="h-36 sm:h-48"><DestinationArt kind={artFor(dest.slug)} /></div>
        <div className="p-4 sm:p-6">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700"><MapPin className="size-4" aria-hidden />{d.dest.badge}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{locName(dest, locale)}</h1>
        </div>
      </header>

      {/* Aller / Retour */}
      <nav aria-label={d.dest.direction} className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
        {(["go", "back"] as const).map((k) => (
          <Link key={k} href={href({ dir: k === "back" ? "back" : undefined })} aria-current={dir === k ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl px-2 text-center transition", dir === k ? "bg-white shadow-sm" : "text-slate-600 hover:bg-white/60")}>
            <span className="text-sm font-bold">{k === "go" ? d.dest.go : d.dest.back}</span>
            <span className="truncate text-xs text-slate-500 max-w-full" dir="auto">{isHome ? (k === "go" ? fmt(d.dest.toCity, { city: name(home) }) : fmt(d.dest.fromCity, { city: name(home) })) : dirLabel(k)}</span>
          </Link>
        ))}
      </nav>

      {/* Date + seats: plain GET form, works without JavaScript */}
      <div className="wf-scroll-x mt-4 flex gap-2 overflow-x-auto pb-1">
        <Link href={href({ date: undefined })} className={chip(!date)}>{d.dest.anyDay}</Link>
        <Link href={href({ date: today })} className={chip(date === today)}>{d.dest.today}</Link>
        <Link href={href({ date: tomorrow })} className={chip(date === tomorrow)}>{d.dest.tomorrow}</Link>
      </div>
      <form method="get" className="mt-2 grid grid-cols-[minmax(0,1fr)_5.5rem_auto] gap-2">
        {dir === "back" && <input type="hidden" name="dir" value="back" />}
        <label className="relative min-w-0">
          <span className="sr-only">{d.search.date}</span>
          <CalendarDays className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-brand-600" aria-hidden />
          <input type="date" name="date" min={today} defaultValue={date} className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white ps-10 pe-2 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
        </label>
        <label className="relative">
          <span className="sr-only">{d.search.passengers}</span>
          <Users className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-brand-600" aria-hidden />
          <select name="seats" defaultValue={seats} className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white ps-10 pe-2 text-[15px] focus:border-brand-500 focus:outline-none">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="submit" className={buttonClass("primary", "md", "h-12 px-3")}>{d.common.apply}</button>
      </form>

      {/* Two actions for this destination */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <a href="#rides" className="flex items-center gap-3 rounded-2xl bg-brand-600 p-3 text-white shadow-sm sm:p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20"><Car className="size-5" aria-hidden /></span>
          <span className="min-w-0"><span className="block font-bold leading-tight">{d.dest.findRide}</span><span className="block text-xs text-white/85">{plural(d.units.results, total, locale)}</span></span>
        </a>
        <Link href={publishHref} className="flex items-center gap-3 rounded-2xl bg-accent-600 p-3 text-white shadow-sm sm:p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20"><CirclePlus className="size-5" aria-hidden /></span>
          <span className="min-w-0"><span className="block font-bold leading-tight">{d.dest.findPassengers}</span><span className="block text-xs text-white/85">{d.dest.findPassengersHint}</span></span>
        </Link>
      </div>

      {/* Rides on this route only */}
      <section id="rides" aria-live="polite" className="mt-6 scroll-mt-20">
        <h2 className="text-lg font-bold">{d.dest.ridesTitle}</h2>
        {error ? (
          <p role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{d.errors.unknown}</p>
        ) : rows.length > 0 ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              {rows.map((r) => <TripCard key={r.id} trip={r} locations={byId} d={d} locale={locale} />)}
            </div>
            {total > LIMIT && (
              <ButtonLink href={`/search?${new URLSearchParams({ ...(origin ? { from: origin.slug } : {}), ...(destination ? { to: destination.slug } : {}), ...(date ? { date } : {}) })}`} variant="outline" className="mt-4 w-full">{d.common.seeAll}</ButtonLink>
            )}
          </>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={<SearchX className="size-6" />}
              title={d.dest.emptyTitle}
              action={
                <>
                  {date && <ButtonLink variant="outline" size="sm" href={href({ date: undefined })}>{d.search.removeDate}</ButtonLink>}
                  <ButtonLink variant="outline" size="sm" href={href({ dir: dir === "go" ? "back" : undefined })}><ArrowLeftRight className="size-4" aria-hidden />{d.search.swapDirection}</ButtonLink>
                </>
              }
            />
          </div>
        )}
      </section>

      {/* Good to know: three short facts */}
      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { Icon: MapPin, title: d.dest.infoPlaceTitle, body: d.dest.infoPlaceBody },
          { Icon: Banknote, title: d.dest.infoPayTitle, body: d.dest.infoPayBody },
          { Icon: MessageCircle, title: d.dest.infoContactTitle, body: d.dest.infoContactBody },
        ].map(({ Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-5" aria-hidden /></span>
            <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-sm text-slate-600">{body}</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-500">{d.dest.legalNote}</p>
    </div>
  );
}

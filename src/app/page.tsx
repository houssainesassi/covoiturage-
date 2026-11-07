import Link from "next/link";
import { ArrowRight, Banknote, Car, CirclePlus, Flag, Landmark, ListChecks, MapPin, MessageCircle, Phone, Search, Star, UserCheck, Users } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import { fmt, formatNumber, formatPrice, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { TRIP_CARD_SELECT, toCard } from "@/lib/queries";
import { SearchForm } from "@/components/search/search-form";
import { TripCard } from "@/components/trips/trip-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

const REGION_DESTINATIONS = ["tunis", "zaghouan", "ben-arous", "sousse", "kairouan", "siliana", "nabeul", "sfax"];

export default async function HomePage() {
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locations = await getLocations();
  const byId = new Map(locations.map((l) => [l.id, l]));
  const home = locations.find((l) => l.slug === site.homeCitySlug) ?? locations[0];
  const now = new Date().toISOString();

  const [{ data: upcoming, error: upcomingError }, { data: recent, error: recentError }] = await Promise.all([
    supabase.from("trips").select("origin_id, destination_id, price_per_seat").eq("status", "scheduled").gt("departure_at", now).gt("seats_available", 0).limit(2000),
    supabase.from("trips").select(TRIP_CARD_SELECT).eq("status", "scheduled").gt("departure_at", now).gt("seats_available", 0).order("created_at", { ascending: false }).limit(6),
  ]);
  const loadError = Boolean(upcomingError || recentError);
  // No upcoming departures: show the latest completed public trips so visitors still see real activity.
  const { data: past } = !loadError && (recent ?? []).length === 0
    ? await supabase.from("trips").select(TRIP_CARD_SELECT).eq("status", "completed").order("departure_at", { ascending: false }).limit(6)
    : { data: null };
  const showPast = (past ?? []).length > 0;

  const routeStats = new Map<string, { count: number; min: number }>();
  const destStats = new Map<string, number>();
  for (const t of upcoming ?? []) {
    destStats.set(t.destination_id, (destStats.get(t.destination_id) ?? 0) + 1);
    if (home && t.origin_id === home.id) {
      const s = routeStats.get(t.destination_id) ?? { count: 0, min: Infinity };
      s.count++;
      s.min = Math.min(s.min, Number(t.price_per_seat));
      routeStats.set(t.destination_id, s);
    }
  }
  const regionRoutes = REGION_DESTINATIONS.map((slug) => locations.find((l) => l.slug === slug)).filter((l) => l && l.id !== home?.id).slice(0, 6);
  const popular = locations.filter((l) => l.kind === "city" && l.is_capital && l.id !== home?.id).slice(0, 8);
  const delegations = locations.filter((l) => l.governorate_code === site.homeGovernorate);
  const lite = locations.map(toLite);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-900 via-brand-800 to-brand-700 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #fff 0, transparent 35%), radial-gradient(circle at 80% 0%, #ff8a4c 0, transparent 30%)" }} aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur"><MapPin className="size-3.5" aria-hidden />{d.home.heroBadge}</p>
          <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl animate-fade-up">{d.home.heroTitle}</h1>
          <p className="mt-4 max-w-2xl text-base text-brand-100 sm:text-lg">{d.home.heroSubtitle}</p>

          {/* Two primary actions */}
          <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
            <Link href="/search" className="group flex min-h-20 items-center gap-4 rounded-2xl bg-white p-4 text-slate-900 shadow-lg transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><Search className="size-6" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{d.home.heroFind}</span>
                <span className="block text-sm text-slate-500">{d.home.heroFindHint}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-brand-600 transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
            </Link>
            <Link href="/dashboard/trips/new" className="group flex min-h-20 items-center gap-4 rounded-2xl bg-accent-500 p-4 text-white shadow-lg transition hover:bg-accent-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/20"><CirclePlus className="size-6" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{d.home.heroOffer}</span>
                <span className="block text-sm text-white/85">{d.home.heroOfferHint}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
            </Link>
          </div>

          <div className="mt-8 max-w-5xl">
            <p className="mb-2 text-sm font-semibold text-brand-100">{d.home.heroSearchLabel}</p>
            <div className="text-slate-900"><SearchForm locations={lite} initial={{ from: home?.slug }} /></div>
          </div>
          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm text-brand-100">
            <div><dt className="sr-only">{d.home.statsTrips}</dt><dd><strong className="text-xl text-white">{formatNumber(upcoming?.length ?? 0, locale)}</strong> {d.home.statsTrips}</dd></div>
            <div><dd><strong className="text-xl text-white">{formatNumber(locations.length, locale)}</strong> {d.home.statsCities}</dd></div>
            <div><dd><strong className="text-xl text-white">{formatNumber(24, locale)}</strong> {d.home.statsGovernorates}</dd></div>
          </dl>
        </div>
      </section>

      {/* How it works — right after the hero so first-time visitors see it immediately */}
      <section id="how" className="scroll-mt-20 bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">{d.home.howTitle}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">{d.home.howSubtitle}</p>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {[
              { title: d.home.howPassengerTitle, steps: d.home.how, icons: [Search, ListChecks, Car], cta: <ButtonLink href="/search" size="lg" className="w-full sm:w-auto"><Search className="size-5" aria-hidden />{d.home.heroFind}</ButtonLink>, Head: Search, tone: "bg-brand-50 text-brand-700" },
              { title: d.home.howDriverTitle, steps: d.home.howDriver, icons: [CirclePlus, UserCheck, Users], cta: <ButtonLink href="/dashboard/trips/new" variant="accent" size="lg" className="w-full sm:w-auto"><CirclePlus className="size-5" aria-hidden />{d.home.heroOffer}</ButtonLink>, Head: Car, tone: "bg-accent-50 text-accent-600" },
            ].map((col) => (
              <div key={col.title} className="flex flex-col rounded-3xl border border-slate-200 bg-sand-100/60 p-5 sm:p-7">
                <h3 className="flex items-center gap-3 text-xl font-bold">
                  <span className={`flex size-10 items-center justify-center rounded-xl ${col.tone}`}><col.Head className="size-5" aria-hidden /></span>
                  {col.title}
                </h3>
                <ol className="mt-6 flex-1 space-y-5">
                  {col.steps.map((s, i) => {
                    const Icon = col.icons[i] ?? Search;
                    return (
                      <li key={s.title} className="flex gap-4">
                        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
                          <Icon className="size-5" aria-hidden />
                          <span className="absolute -top-1 -end-1 flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold">{s.title}</p>
                          <p className="mt-0.5 text-slate-600">{s.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-6">{col.cta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Home region */}
      {home && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{fmt(d.home.regionTitle, { city: locName(home, locale) })}</h2>
          <p className="mt-1 text-slate-500">{d.home.regionSubtitle}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {regionRoutes.map((dest) => {
              const s = routeStats.get(dest!.id);
              return (
                <Link key={dest!.id} href={`/search?from=${home.slug}&to=${dest!.slug}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)] transition hover:border-brand-300">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{routeLabel(locName(home, locale), locName(dest, locale), locale)}</p>
                    <p className="text-sm text-slate-500">{s ? `${plural(d.home.upcoming, s.count, locale)} · ${fmt(d.home.fromPrice, { price: formatPrice(s.min, locale) })}` : d.home.noTripsYet}</p>
                  </div>
                  <ArrowRight className="size-5 shrink-0 text-brand-600 transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent trips */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{showPast ? d.home.pastTitle : d.home.recentTitle}</h2>
              <p className="mt-1 text-slate-500">{showPast ? d.home.pastSubtitle : d.home.recentSubtitle}</p>
            </div>
            <Link href="/search" className="text-sm font-semibold text-brand-700 hover:underline">{d.common.seeAll}</Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(showPast ? past! : recent ?? []).map((t) => <TripCard key={t.id} trip={toCard(t)} locations={byId} d={d} locale={locale} />)}
          </div>
          {loadError && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{d.errors.unknown}</p>}
          {!loadError && !showPast && (recent ?? []).length === 0 && (
            <EmptyState icon={<Car className="size-6" />} title={d.home.recentEmpty} action={<ButtonLink href="/dashboard/trips/new">{d.home.ctaPublish}</ButtonLink>} />
          )}
        </div>
      </section>

      {/* Popular destinations */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{d.home.popularTitle}</h2>
        <p className="mt-1 text-slate-500">{d.home.popularSubtitle}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {popular.map((l, i) => (
            <Link key={l.id} href={`/search?to=${l.slug}`} className="group relative overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-card)]" style={{ background: `linear-gradient(135deg, hsl(${165 - i * 14} 60% ${30 + (i % 3) * 5}%), hsl(${190 - i * 10} 55% 22%))` }}>
              <p className="text-lg font-bold">{locName(l, locale)}</p>
              <p className="text-sm text-white/80">{plural(d.home.upcoming, destStats.get(l.id) ?? 0, locale)}</p>
              <ArrowRight className="absolute bottom-4 end-4 size-5 opacity-70 transition group-hover:opacity-100 rtl:rotate-180" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      {/* Trust: how the platform connects people */}
      <section id="trust" className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{d.home.trustTitle}</h2>
          <p className="mt-2 max-w-3xl text-slate-600">{d.home.trustSubtitle}</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.home.trustItems.map((it, i) => {
              const Icon = [Users, MessageCircle, Phone, Banknote, Star, Flag][i] ?? Users;
              return (
                <li key={it.title} className="flex gap-4 rounded-2xl border border-slate-200 p-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-5" aria-hidden /></span>
                  <div className="min-w-0">
                    <h3 className="font-semibold">{it.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{it.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* About El Fahs */}
      <section id="el-fahs" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><Landmark className="size-7 text-brand-600" aria-hidden />{d.home.aboutTitle}</h2>
            <div className="mt-4 space-y-3 text-slate-600">{d.home.aboutBody.map((p) => <p key={p}>{p}</p>)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-card)]">
            <h3 className="font-semibold">{d.home.delegationsTitle}</h3>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {delegations.map((l) => (
                <li key={l.id}>
                  <Link href={`/search?from=${l.slug}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800">
                    <MapPin className="size-4 text-brand-600" aria-hidden />{locName(l, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-r from-accent-500 to-accent-600 p-8 text-white sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-2xl font-bold">{d.home.ctaTitle}</h2>
            <p className="mt-1 text-white/90">{d.home.ctaBody}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/trips/new" variant="outline" size="lg" className="border-transparent text-accent-600">{d.home.ctaPublish}</ButtonLink>
            <ButtonLink href="/auth/register" variant="ghost" size="lg" className="text-white ring-1 ring-white/40 hover:bg-white/10">{d.home.ctaRegister}</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

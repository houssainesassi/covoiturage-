import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Banknote, Car, CirclePlus, KeyRound, Search, Users } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import { FEATURED_DESTINATIONS, artFor, photoFor } from "@/lib/destinations";
import { rentalsEnabled } from "@/lib/features";
import { plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { TRIP_CARD_SELECT, toCard, withDriverPhones } from "@/lib/queries";
import { CarArt, DestinationArt } from "@/components/destinations/art";
import { DestinationPicker } from "@/components/destinations/destination-picker";
import { TripCard } from "@/components/trips/trip-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import type { Location } from "@/lib/supabase/database.types";

export default async function HomePage() {
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locations = await getLocations();
  const byId = new Map(locations.map((l) => [l.id, l]));
  const home = locations.find((l) => l.slug === site.homeCitySlug) ?? locations[0];
  const featured = FEATURED_DESTINATIONS.map((s) => locations.find((l) => l.slug === s)).filter((l): l is Location => !!l);
  const now = new Date().toISOString();

  // One cheap count per destination card (head request, no rows) instead of loading every trip.
  const live = () => supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "scheduled").gt("departure_at", now).gt("seats_available", 0);
  const [recentRes, ...counts] = await Promise.all([
    supabase.from("trips").select(TRIP_CARD_SELECT).eq("status", "scheduled").gt("departure_at", now).gt("seats_available", 0).order("created_at", { ascending: false }).limit(6),
    ...featured.map((l) =>
      !home ? Promise.resolve({ count: 0 })
      : l.id === home.id ? live().or(`origin_id.eq.${home.id},destination_id.eq.${home.id}`)
      : live().or(`and(origin_id.eq.${home.id},destination_id.eq.${l.id}),and(origin_id.eq.${l.id},destination_id.eq.${home.id})`),
    ),
  ]);
  const loadError = Boolean(recentRes.error);
  const offers = await withDriverPhones(supabase, (recentRes.data ?? []).map(toCard));
  // Nothing bookable yet: show completed public rides, clearly labelled, so visitors still see real activity.
  const { data: past } = !loadError && offers.length === 0
    ? await supabase.from("trips").select(TRIP_CARD_SELECT).eq("status", "completed").order("departure_at", { ascending: false }).limit(3)
    : { data: null };
  const pastCards = (past ?? []).map(toCard);
  const rentals = rentalsEnabled();

  return (
    <>
      {/* Hero: one sentence, one picture, two actions */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-800 to-brand-700 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-4 px-4 pb-4 pt-6 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-12">
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl animate-fade-up">{d.home.heroTitle}</h1>
            <p className="mt-2 text-brand-100 sm:text-lg">{d.home.heroSubtitle}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
              <Link href="/search" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-center font-bold text-brand-800 shadow-lg transition hover:bg-brand-50">
                <Search className="size-5 shrink-0" aria-hidden />{d.home.heroFind}
              </Link>
              <Link href="/dashboard/trips/new" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-accent-500 px-3 text-center font-bold text-white shadow-lg transition hover:bg-accent-600">
                <CirclePlus className="size-5 shrink-0" aria-hidden />{d.home.heroOffer}
              </Link>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[12rem] md:max-w-md" aria-hidden>
            <CarArt className="w-full drop-shadow-2xl" />
          </div>
        </div>
      </section>

      {/* Destinations: each one opens its own page */}
      <section id="destinations" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-6 sm:px-6 sm:pt-10">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{d.dest.homeTitle}</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {featured.map((l, i) => {
            const c = counts[i]?.count ?? 0;
            const photo = photoFor(l.slug);
            return (
              <li key={l.id} className={i === 0 ? "col-span-2 lg:col-span-1" : undefined}>
                <Link href={`/destinations/${l.slug}`} className="group block overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                  <div className={`relative overflow-hidden bg-slate-100 ${i === 0 ? "h-32 sm:h-36" : "h-28 sm:h-36"}`}>
                    {photo ? (
                      <>
                        <Image src={photo} alt="" fill sizes="(min-width: 1024px) 20vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition duration-500 ease-out group-hover:scale-105" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" aria-hidden />
                      </>
                    ) : (
                      <DestinationArt kind={artFor(l.slug)} />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold sm:text-lg">{locName(l, locale)}</p>
                      <p className="truncate text-xs text-slate-500">{c > 0 ? plural(d.home.upcoming, c, locale) : d.dest.noRideShort}</p>
                    </div>
                    <ArrowRight className="size-5 shrink-0 text-brand-600 transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 rounded-3xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <label htmlFor="other-destination" className="mb-2 block font-semibold text-brand-900">{d.dest.otherTitle}</label>
          <DestinationPicker locations={locations.map(toLite)} />
        </div>
      </section>

      {/* Car rental: separate service, shown only once legally cleared and switched on */}
      {rentals && (
        <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <Link href="/rentals" className="group flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-accent-50 to-white p-4 ring-1 ring-accent-100">
            <CarArt tone="accent" className="w-32 shrink-0 sm:w-44" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-lg font-bold"><KeyRound className="size-5 text-accent-600" aria-hidden />{d.rentals.title}</p>
              <p className="text-sm text-slate-600">{d.rentals.homeHint}</p>
            </div>
            <ArrowRight className="size-5 shrink-0 text-accent-600 rtl:rotate-180" aria-hidden />
          </Link>
        </section>
      )}

      {/* Latest offers */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{offers.length || loadError ? d.home.recentTitle : pastCards.length ? d.home.pastTitle : d.home.recentTitle}</h2>
          <Link href="/search" className="text-sm font-semibold text-brand-700 hover:underline">{d.common.seeAll}</Link>
        </div>
        {loadError ? (
          <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{d.errors.unknown}</p>
        ) : offers.length + pastCards.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 max-md:[&>*:nth-child(n+4)]:hidden">
            {(offers.length ? offers : pastCards).map((t) => <TripCard key={t.id} trip={t} locations={byId} d={d} locale={locale} />)}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState icon={<Car className="size-6" />} title={d.home.recentEmpty} action={<ButtonLink href="/dashboard/trips/new">{d.home.ctaPublish}</ButtonLink>} />
          </div>
        )}
      </section>

      {/* How it works, in three icons */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-12 sm:px-6">
        <ol className="grid grid-cols-3 gap-2 rounded-3xl bg-white p-4 text-center ring-1 ring-slate-200 sm:gap-6 sm:p-6">
          {[
            { Icon: Search, label: d.dest.step1 },
            { Icon: Users, label: d.dest.step2 },
            { Icon: Banknote, label: d.dest.step3 },
          ].map(({ Icon, label }, i) => (
            <li key={label} className="flex flex-col items-center gap-2">
              <span className="relative flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <Icon className="size-6" aria-hidden />
                <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
              </span>
              <span className="text-sm font-semibold leading-tight">{label}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

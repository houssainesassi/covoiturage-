import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { createClient } from "@/lib/supabase/server";
import { fmt, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { SearchForm } from "@/components/search/search-form";
import { SearchFilters } from "@/components/search/filters";
import { TripCard } from "@/components/trips/trip-card";
import { TRIP_CARD_SELECT, toCard } from "@/lib/queries";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Pagination } from "@/components/ui/misc";

const PAGE_SIZE = 12;
const TIME_BUCKETS: Record<string, [string, string]> = {
  early: ["00:00", "05:59"],
  morning: ["06:00", "11:59"],
  afternoon: ["12:00", "17:59"],
  evening: ["18:00", "23:59"],
};

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.search.title };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const { d, locale } = await getI18n();
  const locations = await getLocations();
  const byId = new Map(locations.map((l) => [l.id, l]));
  const from = locations.find((l) => l.slug === one("from"));
  const to = locations.find((l) => l.slug === one("to"));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one("date") ?? "") ? one("date")! : undefined;
  const seats = Math.min(Math.max(Number(one("seats")) || 1, 1), 8);
  const maxPrice = Number(one("maxPrice")) || undefined;
  const minRating = Number(one("rating")) || undefined;
  const time = TIME_BUCKETS[one("time") ?? ""];
  const sort = ["price", "rating"].includes(one("sort") ?? "") ? one("sort")! : "departure";
  const page = Math.max(Number(one("page")) || 1, 1);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_trips", {
    p_origin_id: from?.id ?? null,
    p_destination_id: to?.id ?? null,
    p_date: date ?? null,
    p_seats: seats,
    p_max_price: maxPrice ?? null,
    p_time_from: time?.[0] ?? null,
    p_time_to: time?.[1] ?? null,
    p_min_rating: minRating ?? null,
    p_sort: sort,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Nothing bookable matches: show completed public trips on the same route so visitors see real activity.
  let past: ReturnType<typeof toCard>[] = [];
  if (!error && rows.length === 0) {
    let q = supabase.from("trips").select(TRIP_CARD_SELECT).eq("status", "completed");
    if (from) q = q.eq("origin_id", from.id);
    if (to) q = q.eq("destination_id", to.id);
    if (maxPrice) q = q.lte("price_per_seat", maxPrice);
    if (date) q = q.gte("departure_at", `${date}T00:00:00+01:00`).lt("departure_at", `${date}T23:59:59+01:00`);
    const { data: pastRows } = await q.order("departure_at", { ascending: false }).limit(6);
    past = (pastRows ?? []).map(toCard);
  }

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v);
    for (const [k, v] of Object.entries(patch)) if (v === undefined) p.delete(k); else p.set(k, v);
    return `/search?${p}`;
  };

  const heading = from || to ? routeLabel(from ? locName(from, locale) : "…", to ? locName(to, locale) : "…", locale) : d.search.allRides;
  const suggestions = [["el-fahs", "tunis"], ["tunis", "el-fahs"], ["el-fahs", "zaghouan"], ["tunis", "sousse"], ["tunis", "sfax"], ["sousse", "kairouan"]]
    .map(([a, b]) => [locations.find((l) => l.slug === a), locations.find((l) => l.slug === b)] as const)
    .filter(([a, b]) => a && b);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <SearchForm compact locations={locations.map(toLite)} initial={{ from: from?.slug, to: to?.slug, date, seats }} />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:mt-8 lg:gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside>
          <details className="wf-filters rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="flex min-h-6 cursor-pointer items-center gap-2 font-semibold lg:pointer-events-none"><SlidersHorizontal className="size-4" aria-hidden />{d.common.filters}</summary>
            <div className="mt-4"><SearchFilters /></div>
          </details>
          <p className="mt-3 px-1 text-xs text-slate-500">{d.search.radiusHint}</p>
        </aside>
        <section aria-live="polite">
          <h1 className="text-xl font-bold sm:text-2xl">{heading}</h1>
          <p className="mb-4 text-sm text-slate-500">{error ? d.errors.unknown : plural(d.units.results, total, locale)}</p>
          {rows.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {rows.map((r) => (
                  <TripCard
                    key={r.id}
                    locations={byId}
                    d={d}
                    locale={locale}
                    trip={{ ...r, price_per_seat: Number(r.price_per_seat), driver_rating: Number(r.driver_rating), vehicle: [r.vehicle_brand, r.vehicle_model].filter(Boolean).join(" ") || null }}
                  />
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} hrefFor={(p) => qs({ page: String(p) })} labels={{ previous: d.common.previous, next: d.common.next, pageOf: fmt(d.common.pageOf, { page, total: totalPages }) }} />
            </>
          ) : (
            <div className="space-y-6">
              <EmptyState
                icon={<SearchX className="size-6" />}
                title={d.search.emptyTitle}
                body={d.search.emptyBody}
                action={
                  <>
                    {date && <ButtonLink variant="outline" size="sm" href={qs({ date: undefined, page: undefined })}>{d.search.removeDate}</ButtonLink>}
                    {from && to && <ButtonLink variant="outline" size="sm" href={qs({ from: to.slug, to: from.slug, page: undefined })}>{d.search.swapDirection}</ButtonLink>}
                    <ButtonLink size="sm" href="/dashboard/trips/new">{d.search.publishInstead}</ButtonLink>
                  </>
                }
              />
              {past.length > 0 && (
                <div>
                  <h2 className="mb-3 font-semibold">{from || to ? d.search.pastTitle : d.home.pastTitle}</h2>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {past.map((t) => <TripCard key={t.id} trip={t} locations={byId} d={d} locale={locale} />)}
                  </div>
                </div>
              )}
              <div>
                <h2 className="mb-3 font-semibold">{d.search.suggestionsTitle}</h2>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(([a, b]) => (
                    <Link key={`${a!.slug}-${b!.slug}`} href={`/search?from=${a!.slug}&to=${b!.slug}`} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:border-brand-300 hover:text-brand-800">
                      {routeLabel(locName(a, locale), locName(b, locale), locale)}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

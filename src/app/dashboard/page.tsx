import Link from "next/link";
import { Bell, CalendarCheck, Car, MessageCircle, PlusCircle, Search, Star, UserRound } from "lucide-react";
import { getProfile, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, plural } from "@/lib/i18n/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge, bookingTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, StatCard } from "@/components/ui/misc";
import { MiniTrip } from "@/components/trips/mini-trip";

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const now = new Date().toISOString();

  const [bookingsRes, tripsRes, pendingRes, unreadRes, reviewsRes, privRes] = await Promise.all([
    supabase.from("bookings").select("id, status, seats, trip:trips!bookings_trip_id_fkey!inner(id, departure_at, origin_id, destination_id, status)").eq("passenger_id", user.id).in("status", ["pending", "confirmed"]).gt("trip.departure_at", now).order("created_at", { ascending: false }).limit(10),
    supabase.from("trips").select("id, departure_at, origin_id, destination_id, seats_total, seats_available").eq("driver_id", user.id).eq("status", "scheduled").gt("departure_at", now).order("departure_at").limit(10),
    supabase.from("bookings").select("id, trip:trips!bookings_trip_id_fkey!inner(driver_id, status)", { count: "exact", head: true }).eq("status", "pending").eq("trip.driver_id", user.id).eq("trip.status", "scheduled"),
    supabase.rpc("unread_message_count"),
    supabase.rpc("pending_reviews"),
    supabase.from("profile_private").select("phone").eq("id", user.id).maybeSingle(),
  ]);
  const bookings = bookingsRes.data ?? [];
  const trips = tripsRes.data ?? [];
  const pendingReviews = reviewsRes.data?.length ?? 0;
  const incomplete = !profile?.avatar_path || !privRes.data?.phone;

  type Upcoming = { key: string; href: string; departure: string; origin: string; dest: string; right: React.ReactNode; sub: React.ReactNode };
  const upcoming: Upcoming[] = [
    ...bookings.filter((b) => b.trip).map((b) => ({ key: b.id, href: `/trips/${b.trip!.id}`, departure: b.trip!.departure_at, origin: b.trip!.origin_id, dest: b.trip!.destination_id, right: <Badge tone={bookingTone[b.status]}>{d.status.booking[b.status]}</Badge>, sub: `${d.dashboard.asPassenger} · ${plural(d.units.seats, b.seats, locale)}` })),
    ...trips.map((t) => ({ key: t.id, href: `/dashboard/trips/${t.id}`, departure: t.departure_at, origin: t.origin_id, dest: t.destination_id, right: <Badge tone="brand">{fmt(d.driverTrips.booked, { booked: t.seats_total - t.seats_available, total: t.seats_total })}</Badge>, sub: d.dashboard.asDriver })),
  ].sort((a, b) => a.departure.localeCompare(b.departure));

  return (
    <div className="space-y-8">
      <section className="relative isolate overflow-hidden rounded-[var(--radius-card)] bg-brand-900 p-5 text-white shadow-[var(--shadow-lift)] sm:p-7">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(90%_120%_at_100%_0%,var(--color-brand-600)_0%,transparent_60%),radial-gradient(60%_80%_at_0%_100%,rgb(247_106_37/0.2)_0%,transparent_60%)]" aria-hidden />
        <div className="flex flex-wrap items-center gap-4">
          <Avatar path={profile?.avatar_path} name={profile?.full_name} size="lg" className="ring-2 ring-white/30" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{fmt(d.dashboard.welcome, { name: profile?.full_name?.split(" ")[0] || "" })}</h1>
            <p className="mt-0.5 text-sm text-brand-100 sm:text-base">{d.dashboard.subtitle}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Link href="/search" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-semibold text-brand-800 shadow-sm transition hover:bg-brand-50 active:scale-[0.98]"><Search className="size-4" aria-hidden />{d.dashboard.findRide}</Link>
          <ButtonLink href="/dashboard/trips/new" variant="accent"><PlusCircle className="size-4" aria-hidden />{d.dashboard.publishRide}</ButtonLink>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard href="/dashboard/bookings" label={d.dashboard.statUpcomingPassenger} value={bookings.length} icon={<CalendarCheck className="size-5" />} />
        <StatCard href="/dashboard/trips" label={d.dashboard.statUpcomingDriver} value={trips.length} icon={<Car className="size-5" />} />
        <StatCard href="/dashboard/trips" label={d.dashboard.statPending} value={pendingRes.count ?? 0} icon={<Bell className="size-5" />} tone="accent" highlight={(pendingRes.count ?? 0) > 0} />
        <StatCard href="/dashboard/messages" label={d.dashboard.statUnread} value={typeof unreadRes.data === "number" ? unreadRes.data : 0} icon={<MessageCircle className="size-5" />} tone="slate" />
      </div>
      {(pendingReviews > 0 || incomplete) && (
        <div className="grid gap-3 md:grid-cols-2">
          {pendingReviews > 0 && (
            <Link href="/dashboard/reviews" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100/60">
              <Star className="size-5 shrink-0 text-amber-600" aria-hidden />
              <div><p className="font-semibold text-amber-900">{d.dashboard.pendingReviewsTitle}</p><p className="text-sm text-amber-800">{plural(d.dashboard.pendingReviewsBody, pendingReviews, locale)}</p></div>
            </Link>
          )}
          {incomplete && (
            <Link href="/dashboard/profile" className="flex gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 hover:bg-brand-100/60">
              <UserRound className="size-5 shrink-0 text-brand-700" aria-hidden />
              <div><p className="font-semibold text-brand-900">{d.dashboard.completeProfileTitle}</p><p className="text-sm text-brand-800">{d.dashboard.completeProfileBody}</p></div>
            </Link>
          )}
        </div>
      )}
      <section>
        <h2 className="mb-3 text-lg font-semibold">{d.dashboard.nextTrips}</h2>
        {upcoming.length ? (
          <div className="space-y-3">{upcoming.map((u) => <MiniTrip key={u.key} href={u.href} departure={u.departure} originId={u.origin} destinationId={u.dest} locations={locs} locale={locale} right={u.right} sub={u.sub} />)}</div>
        ) : (
          <EmptyState icon={<Car className="size-6" />} title={d.dashboard.noUpcoming} action={<><ButtonLink href="/search" variant="outline">{d.dashboard.findRide}</ButtonLink><ButtonLink href="/dashboard/trips/new">{d.dashboard.publishRide}</ButtonLink></>} />
        )}
      </section>
    </div>
  );
}

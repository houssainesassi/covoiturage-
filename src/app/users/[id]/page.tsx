import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Car, MapPin, Star, Users } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDate, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { TRIP_CARD_SELECT, toCard } from "@/lib/queries";
import { uuidSchema } from "@/lib/validation";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { StatCard, Stars } from "@/components/ui/misc";
import { TripCard } from "@/components/trips/trip-card";
import { ReviewList } from "@/components/reviews/review-list";
import { ReportDialog } from "@/components/report/report-dialog";

async function loadProfile(id: string) {
  if (!uuidSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/users/[id]">): Promise<Metadata> {
  const p = await loadProfile((await params).id);
  return { title: p?.full_name || (await getI18n()).d.notFound.title };
}

export default async function UserPage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;
  const profile = await loadProfile(id);
  if (!profile) notFound();
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const viewer = await getUser();
  const [{ data: reviews }, { data: trips }] = await Promise.all([
    supabase.from("reviews").select("id, rating, comment, created_at, reviewee_role, is_hidden, is_demo, person:profiles!reviews_reviewer_id_fkey(id, full_name, avatar_path)").eq("reviewee_id", id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(30),
    supabase.from("trips").select(TRIP_CARD_SELECT).eq("driver_id", id).eq("status", "scheduled").gt("departure_at", new Date().toISOString()).order("departure_at").limit(6),
  ]);
  const { data: past } = await supabase.from("trips").select(TRIP_CARD_SELECT).eq("driver_id", id).eq("status", "completed").order("departure_at", { ascending: false }).limit(4);
  const upcomingCards = (trips ?? []).map(toCard);
  const pastCards = (past ?? []).map(toCard);
  const city = profile.city_id ? locs.get(profile.city_id) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-start">
          <Avatar path={profile.avatar_path} name={profile.full_name} size="xl" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{profile.full_name || d.common.unknownUser}</h1>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-slate-500 sm:justify-start">
              {profile.rating_count > 0 ? <span className="flex items-center gap-1"><Stars value={Number(profile.rating_avg)} />{Number(profile.rating_avg).toFixed(1)} · {plural(d.units.reviews, profile.rating_count, locale)}</span> : <span>{d.trip.newMember}</span>}
              {city && <span className="flex items-center gap-1"><MapPin className="size-4" aria-hidden />{locName(city, locale)}</span>}
              <span>{fmt(d.common.memberSince, { date: formatDate(profile.created_at, locale, "short") })}</span>
            </p>
            {profile.status === "suspended" && <Badge tone="danger" className="mt-2">{d.profile.suspended}</Badge>}
            {profile.is_demo && <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-amber-800 sm:justify-start"><DemoBadge label={d.common.demo} />{d.profile.demoNotice}</p>}
            {profile.bio && <p className="mt-3 max-w-2xl text-slate-700">{profile.bio}</p>}
          </div>
          {viewer && viewer.id !== profile.id && <ReportDialog userId={profile.id} name={profile.full_name} />}
        </div>
      </Card>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard label={d.profile.tripsDriven} value={profile.trips_driven} icon={<Car className="size-5" />} />
        <StatCard label={d.profile.tripsTaken} value={profile.trips_taken} icon={<Users className="size-5" />} tone="slate" />
        <StatCard label={d.profile.rating} value={profile.rating_count ? Number(profile.rating_avg).toFixed(1) : "—"} icon={<Star className="size-5" />} tone="accent" />
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">{d.profile.upcomingTrips}</h2>
        {(trips ?? []).length ? (
          <div className="grid gap-4 md:grid-cols-2">{upcomingCards.map((t) => <TripCard key={t.id} trip={t} locations={locs} d={d} locale={locale} />)}</div>
        ) : <p className="text-sm text-slate-500">{d.profile.noTrips}</p>}
      </section>
      {(past ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{d.profile.pastTrips}</h2>
          <div className="grid gap-4 md:grid-cols-2">{pastCards.map((t) => <TripCard key={t.id} trip={t} locations={locs} d={d} locale={locale} />)}</div>
        </section>
      )}
      <Card className="mt-8">
        <CardHeader title={d.profile.reviewsTitle} />
        <div className="px-5 sm:px-6"><ReviewList reviews={reviews ?? []} d={d} locale={locale} empty={d.profile.noReviews} /></div>
      </Card>
    </div>
  );
}

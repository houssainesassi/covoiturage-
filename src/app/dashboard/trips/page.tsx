import { Car } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatPrice, plural } from "@/lib/i18n/format";
import { PageHeader } from "@/components/ui/card";
import { Badge, tripTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Tabs } from "@/components/ui/misc";
import { MiniTrip } from "@/components/trips/mini-trip";

export default async function DriverTripsPage({ searchParams }: PageProps<"/dashboard/trips">) {
  const user = await requireUser("/dashboard/trips");
  const raw = (await searchParams).tab;
  const tab = raw === "past" || raw === "cancelled" ? raw : "upcoming";
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const now = new Date().toISOString();

  let q = supabase.from("trips").select("id, departure_at, origin_id, destination_id, seats_total, seats_available, price_per_seat, status, bookings(status)").eq("driver_id", user.id);
  if (tab === "upcoming") q = q.eq("status", "scheduled").gt("departure_at", now).order("departure_at");
  else if (tab === "past") q = q.or(`status.eq.completed,and(status.eq.scheduled,departure_at.lte.${now})`).order("departure_at", { ascending: false }).limit(50);
  else q = q.eq("status", "cancelled").order("departure_at", { ascending: false }).limit(50);
  const { data: trips } = await q;
  const emptyText = { upcoming: d.driverTrips.emptyUpcoming, past: d.driverTrips.emptyPast, cancelled: d.driverTrips.emptyCancelled }[tab];

  return (
    <div>
      <PageHeader title={d.driverTrips.title} action={<ButtonLink href="/dashboard/trips/new">{d.driverTrips.newTrip}</ButtonLink>} />
      <Tabs active={tab} tabs={[
        { key: "upcoming", label: d.driverTrips.upcoming, href: "/dashboard/trips" },
        { key: "past", label: d.driverTrips.past, href: "/dashboard/trips?tab=past" },
        { key: "cancelled", label: d.driverTrips.cancelled, href: "/dashboard/trips?tab=cancelled" },
      ]} />
      {!(trips ?? []).length ? (
        <EmptyState icon={<Car className="size-6" />} title={emptyText} action={tab === "upcoming" ? <ButtonLink href="/dashboard/trips/new">{d.driverTrips.newTrip}</ButtonLink> : undefined} />
      ) : (
        <div className="space-y-3">
          {trips!.map((t) => {
            const pending = t.bookings.filter((b) => b.status === "pending").length;
            const departed = t.status === "scheduled" && t.departure_at <= now;
            return (
              <MiniTrip
                key={t.id}
                href={`/dashboard/trips/${t.id}`}
                departure={t.departure_at}
                originId={t.origin_id}
                destinationId={t.destination_id}
                locations={locs}
                locale={locale}
                sub={<span>{fmt(d.driverTrips.booked, { booked: t.seats_total - t.seats_available, total: t.seats_total })} · {formatPrice(Number(t.price_per_seat), locale)}</span>}
                right={pending > 0 && t.status === "scheduled" ? <Badge tone="warning">{plural(d.units.pendingRequests, pending, locale)}</Badge> : <Badge tone={tripTone[departed ? "departed" : t.status]}>{d.status.trip[departed ? "departed" : t.status]}</Badge>}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

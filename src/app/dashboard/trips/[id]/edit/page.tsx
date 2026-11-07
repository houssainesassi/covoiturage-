import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { createClient } from "@/lib/supabase/server";
import { tunisDateKey, tunisTimeKey } from "@/lib/i18n/format";
import { uuidSchema } from "@/lib/validation";
import { PageHeader } from "@/components/ui/card";
import { TripForm } from "@/components/trips/trip-form";

export default async function EditTripPage({ params }: PageProps<"/dashboard/trips/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/trips/${id}/edit`);
  if (!uuidSchema.safeParse(id).success) notFound();
  const { d } = await getI18n();
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select("*").eq("id", id).eq("driver_id", user.id).maybeSingle();
  if (!trip) notFound();
  if (trip.status !== "scheduled" || new Date(trip.departure_at) <= new Date()) redirect(`/dashboard/trips/${id}`);
  const [locations, { data: vehicles }] = await Promise.all([getLocations(), supabase.rpc("get_my_vehicles")]);
  const dep = new Date(trip.departure_at);
  return (
    <div className="max-w-4xl">
      <PageHeader title={d.tripForm.editTitle} />
      <TripForm
        tripId={trip.id}
        locations={locations.map(toLite)}
        vehicles={vehicles ?? []}
        bookedSeats={trip.seats_total - trip.seats_available}
        defaultDate={tunisDateKey(dep)}
        minDate={tunisDateKey()}
        initial={{
          originId: trip.origin_id, destinationId: trip.destination_id,
          originAddress: trip.origin_address, destinationAddress: trip.destination_address,
          origin: { lat: trip.origin_lat, lng: trip.origin_lng }, destination: { lat: trip.destination_lat, lng: trip.destination_lng },
          date: tunisDateKey(dep), time: tunisTimeKey(dep), seats: trip.seats_total, price: Number(trip.price_per_seat),
          vehicleId: trip.vehicle_id, luggage: trip.luggage_size, description: trip.description ?? "",
        }}
      />
    </div>
  );
}

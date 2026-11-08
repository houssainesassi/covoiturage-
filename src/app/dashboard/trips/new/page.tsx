import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import { tunisDateKey, tunisTomorrowKey } from "@/lib/i18n/format";
import { PageHeader } from "@/components/ui/card";
import { TN_PHONE_REGEX } from "@/lib/phone";
import { PhoneGate } from "@/components/trips/phone-gate";
import { TripForm } from "@/components/trips/trip-form";

export default async function NewTripPage() {
  const user = await requireUser("/dashboard/trips/new");
  const { d } = await getI18n();
  const supabase = await createClient();
  const [locations, { data: vehicles }, { data: priv }] = await Promise.all([
    getLocations(),
    supabase.rpc("get_my_vehicles"),
    supabase.from("profile_private").select("phone").eq("id", user.id).maybeSingle(),
  ]);
  const phone = priv?.phone && TN_PHONE_REGEX.test(priv.phone) ? priv.phone : null;
  return (
    <div className="max-w-4xl">
      <PageHeader title={d.tripForm.newTitle} description={d.tripForm.newSubtitle} />
      {!phone ? <PhoneGate /> : <TripForm driverPhone={phone} locations={locations.map(toLite)} vehicles={vehicles ?? []} defaultOriginSlug={site.homeCitySlug} defaultDate={tunisTomorrowKey()} minDate={tunisDateKey()} />}
    </div>
  );
}

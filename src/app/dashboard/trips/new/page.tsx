import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import { tunisDateKey, tunisTomorrowKey } from "@/lib/i18n/format";
import { PageHeader } from "@/components/ui/card";
import { TN_PHONE_REGEX, isPhoneVerified } from "@/lib/phone";
import { verifyPhoneUrl } from "@/lib/phone-otp";
import { PhoneGate } from "@/components/trips/phone-gate";
import { TripForm } from "@/components/trips/trip-form";

export default async function NewTripPage() {
  const user = await requireUser("/dashboard/trips/new");
  const { d } = await getI18n();
  const supabase = await createClient();
  const [locations, { data: vehicles }, { data: priv }, { data: complete }] = await Promise.all([
    getLocations(),
    supabase.rpc("get_my_vehicles"),
    supabase.from("profile_private").select("phone").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_profile_complete"),
  ]);
  if (complete === false) redirect(`/auth/complete-profile?next=${encodeURIComponent("/dashboard/trips/new")}`);
  const phone = priv?.phone && TN_PHONE_REGEX.test(priv.phone) ? priv.phone : null;
  if (phone && !isPhoneVerified(user, phone)) redirect(verifyPhoneUrl("/dashboard/trips/new"));
  return (
    <div className="max-w-4xl">
      <PageHeader title={d.tripForm.newTitle} description={d.tripForm.newSubtitle} />
      {!phone ? <PhoneGate /> : <TripForm driverPhone={phone} locations={locations.map(toLite)} vehicles={vehicles ?? []} defaultOriginSlug={site.homeCitySlug} defaultDate={tunisTomorrowKey()} minDate={tunisDateKey()} />}
    </div>
  );
}

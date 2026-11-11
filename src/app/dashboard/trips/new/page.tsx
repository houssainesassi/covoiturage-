import { redirect } from "next/navigation";
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

export default async function NewTripPage({ searchParams }: PageProps<"/dashboard/trips/new">) {
  const sp = await searchParams;
  const slug = (k: string) => (typeof sp[k] === "string" && /^[a-z0-9-]+$/.test(sp[k] as string) ? (sp[k] as string) : undefined);
  const qs = new URLSearchParams(Object.entries({ from: slug("from"), to: slug("to") }).filter((e): e is [string, string] => !!e[1]));
  const self = `/dashboard/trips/new${qs.size ? `?${qs}` : ""}`;
  const user = await requireUser(self);
  const { d } = await getI18n();
  const supabase = await createClient();
  const [locations, { data: vehicles }, { data: priv }, { data: complete }] = await Promise.all([
    getLocations(),
    supabase.rpc("get_my_vehicles"),
    supabase.from("profile_private").select("phone").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_profile_complete"),
  ]);
  const { data: vis } = await supabase.from("profile_private").select("phone_public").eq("id", user.id).maybeSingle();
  if (complete === false) redirect(`/auth/complete-profile?next=${encodeURIComponent(self)}`);
  const phone = priv?.phone && TN_PHONE_REGEX.test(priv.phone) ? priv.phone : null;
  return (
    <div className="max-w-4xl">
      <PageHeader title={d.tripForm.newTitle} description={d.tripForm.newSubtitle} />
      {!phone ? <PhoneGate /> : <TripForm driverPhone={phone} driverPhonePublic={vis?.phone_public === true} locations={locations.map(toLite)} vehicles={vehicles ?? []} defaultOriginSlug={slug("from") ?? site.homeCitySlug} defaultDestinationSlug={slug("to")} defaultDate={tunisTomorrowKey()} minDate={tunisDateKey()} />}
    </div>
  );
}

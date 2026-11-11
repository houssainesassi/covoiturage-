import { getProfile, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ProfileForm } from "@/components/profile/profile-form";
import { PhoneVisibility } from "@/components/profile/phone-visibility";

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const profile = await getProfile();
  const { d } = await getI18n();
  const supabase = await createClient();
  const [{ data: priv }, visRes, locations] = await Promise.all([
    supabase.from("profile_private").select("phone, date_of_birth").eq("id", user.id).maybeSingle(),
    // Separate query: before migration 17 the column is missing and the switch is simply hidden.
    supabase.from("profile_private").select("phone_public").eq("id", user.id).maybeSingle(),
    getLocations(),
  ]);
  if (!profile) return null;
  return (
    <div className="max-w-3xl">
      <PageHeader title={d.profile.title} action={<ButtonLink href={`/users/${user.id}`} variant="outline">{d.profile.viewPublic}</ButtonLink>} />
      <ProfileForm profile={profile} phone={priv?.phone ?? ""} dob={priv?.date_of_birth ?? ""} locations={locations.map(toLite)} />
      {!visRes.error && <div className="mt-6"><PhoneVisibility initial={visRes.data?.phone_public ?? false} hasPhone={!!priv?.phone} /></div>}
    </div>
  );
}

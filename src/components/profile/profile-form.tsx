"use client";
import { useFormAction } from "@/lib/use-form-action";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateAvatarAction, updateProfileAction } from "@/actions/profile";
import { useI18n } from "@/lib/i18n/client";
import { MAX_AVATAR_BYTES, publicUrl } from "@/lib/storage";
import { uploadImage } from "@/lib/upload";
import { locName } from "@/lib/names";
import type { LocationLite } from "@/lib/location-lite";
import type { Profile } from "@/lib/supabase/database.types";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { initials } from "@/lib/utils";

export function ProfileForm({ profile, phone, dob, locations }: { profile: Profile; phone: string; dob: string; locations: LocationLite[] }) {
  const { d, locale } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useFormAction(updateProfileAction);
  const [avatar, setAvatar] = useState(profile.avatar_path);
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] ? d.errors[state.fields[k]] : undefined);
  useEffect(() => {
    if (state?.ok) toast.success(d.profile.saved);
  }, [state, d]);

  const onAvatar = (file?: File) =>
    file &&
    startUpload(async () => {
      const up = await uploadImage("avatars", profile.id, file, MAX_AVATAR_BYTES);
      if ("error" in up) return void toast.error(d.errors[up.error]);
      const res = await updateAvatarAction(up.path);
      if (!res.ok) return void toast.error(d.errors[res.error]);
      setAvatar(up.path);
      toast.success(d.profile.saved);
      router.refresh();
    });

  const sortedCities = [...locations].filter((l) => l.kind === "city").sort((a, b) => locName(a, locale).localeCompare(locName(b, locale), locale));
  const url = publicUrl("avatars", avatar);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={d.profile.photo} />
        <div className="flex items-center gap-5 p-5 sm:p-6">
          <div className="relative size-24 overflow-hidden rounded-full bg-brand-100 text-2xl font-bold text-brand-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url ? <img src={url} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center">{initials(profile.full_name)}</span>}
            {uploading && <span className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="size-6 animate-spin text-white" /></span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}><Camera className="size-4" aria-hidden />{d.profile.changePhoto}</Button>
            {avatar && (
              <Button type="button" variant="ghost" disabled={uploading} onClick={() => startUpload(async () => { const r = await updateAvatarAction(null); if (r.ok) { setAvatar(null); router.refresh(); } })}>
                {d.profile.removePhoto}
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
          </div>
        </div>
      </Card>
      <form onSubmit={action}>
        <Card>
          <CardHeader title={d.profile.title} description={d.profile.subtitle} />
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <Field label={d.profile.fullName} htmlFor="fullName" error={err("fullName")}><Input id="fullName" name="fullName" required minLength={2} maxLength={100} defaultValue={profile.full_name} /></Field>
            <Field label={d.profile.phone} htmlFor="phone" error={err("phone")} hint={d.profile.phoneHint}>
              <div className="flex" dir="ltr">
                <span className="flex items-center rounded-s-xl border border-e-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">+216</span>
                <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={phone.replace(/^\+216/, "")} placeholder="22 123 456" className="rounded-s-none" aria-invalid={!!err("phone")} />
              </div>
            </Field>
            <Field label={d.profile.city} htmlFor="cityId" optional={d.common.optional}>
              <Select id="cityId" name="cityId" defaultValue={profile.city_id ?? ""}>
                <option value="">—</option>
                {sortedCities.map((l) => <option key={l.id} value={l.id}>{locName(l, locale)}</option>)}
              </Select>
            </Field>
            <Field label={d.profile.dob} htmlFor="dob" optional={d.common.optional} error={err("dob")}><Input id="dob" name="dob" type="date" defaultValue={dob} /></Field>
            <Field label={d.profile.bio} htmlFor="bio" optional={d.common.optional} className="sm:col-span-2"><Textarea id="bio" name="bio" maxLength={500} defaultValue={profile.bio ?? ""} placeholder={d.profile.bioPlaceholder} /></Field>
          </div>
          <div className="border-t border-slate-100 p-5 sm:p-6">
            <p className="mb-3 font-semibold">{d.profile.preferences}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Checkbox name="prefSmoking" defaultChecked={profile.pref_smoking} label={d.profile.smoking} />
              <Checkbox name="prefPets" defaultChecked={profile.pref_pets} label={d.profile.pets} />
              <Checkbox name="prefMusic" defaultChecked={profile.pref_music} label={d.profile.music} />
              <Checkbox name="prefChatty" defaultChecked={profile.pref_chatty} label={d.profile.chatty} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 border-t border-slate-100 p-5 sm:p-6">
            {state && !state.ok && <FormError message={d.errors[state.error]} />}
            <SubmitButton pending={pending} pendingLabel={d.common.saving}>{d.common.save}</SubmitButton>
          </div>
        </Card>
      </form>
    </div>
  );
}

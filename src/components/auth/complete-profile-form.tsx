"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Camera, Loader2 } from "lucide-react";
import { completeProfileAction } from "@/actions/profile";
import { useFormAction } from "@/lib/use-form-action";
import { useI18n } from "@/lib/i18n/client";
import { MAX_AVATAR_BYTES, publicUrl } from "@/lib/storage";
import { uploadImage } from "@/lib/upload";
import { initials } from "@/lib/utils";
import type { ErrorCode } from "@/lib/errors";
import { Field, FormError, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function CompleteProfileForm({ userId, next, fullName, avatarPath, phone }: { userId: string; next: string; fullName: string; avatarPath: string | null; phone: string }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(completeProfileAction);
  const [avatar, setAvatar] = useState(avatarPath);
  const [name, setName] = useState(fullName);
  const [uploadError, setUploadError] = useState<ErrorCode | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] ? d.errors[state.fields[k]] : undefined);
  const avatarError = uploadError ? d.errors[uploadError] : err("avatar");
  const url = publicUrl("avatars", avatar);

  const onFile = (file?: File) => {
    if (!file) return;
    setUploadError(null);
    startUpload(async () => {
      const up = await uploadImage("avatars", userId, file, MAX_AVATAR_BYTES);
      if ("error" in up) return void setUploadError(up.error);
      setAvatar(up.path);
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <form onSubmit={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="avatarPath" value={avatar ?? ""} />
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={d.completeProfile.addPhoto}
          className={`relative size-28 overflow-hidden rounded-full bg-brand-100 text-3xl font-bold text-brand-800 ring-offset-2 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 ${avatarError ? "ring-2 ring-red-500" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center">{name.trim() ? initials(name) : <Camera className="size-8" aria-hidden />}</span>}
          {uploading && <span className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="size-6 animate-spin text-white" /></span>}
        </button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Camera className="size-4" aria-hidden />{avatar ? d.profile.changePhoto : d.completeProfile.addPhoto}
        </Button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {avatarError ? <p className="text-sm text-red-600" role="alert">{avatarError}</p> : <p className="text-xs text-slate-500">{d.completeProfile.photoHint}</p>}
      </div>
      <Field label={d.auth.fullName} htmlFor="fullName" error={err("fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err("fullName")} />
      </Field>
      <Field label={d.auth.phone} htmlFor="phone" error={err("phone")} hint={d.completeProfile.phoneHint}>
        <div className="flex" dir="ltr">
          <span className="flex items-center rounded-s-xl border border-e-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">+216</span>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required defaultValue={phone.replace(/^\+216/, "")} placeholder="22 123 456" className="rounded-s-none" aria-invalid={!!err("phone")} />
        </div>
      </Field>
      {state && !state.ok && !state.fields && <FormError message={d.errors[state.error]} />}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={uploading}>{d.completeProfile.cta}</Button>
      <Link href={next.startsWith("/dashboard/trips/new") ? "/" : next} className="block text-center text-sm font-semibold text-slate-600 underline underline-offset-2">{d.completeProfile.later}</Link>
    </form>
  );
}

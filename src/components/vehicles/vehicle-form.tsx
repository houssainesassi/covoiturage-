"use client";
import { useFormAction } from "@/lib/use-form-action";
import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { saveVehicleAction } from "@/actions/vehicles";
import { useI18n } from "@/lib/i18n/client";
import { publicUrl, MAX_VEHICLE_PHOTO_BYTES } from "@/lib/storage";
import { uploadImage } from "@/lib/upload";
import type { Vehicle } from "@/lib/supabase/database.types";
import { Card } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";

export function VehicleForm({ userId, vehicle }: { userId: string; vehicle?: Vehicle }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(saveVehicleAction.bind(null, vehicle?.id ?? null));
  const [photos, setPhotos] = useState<string[]>(vehicle?.photo_paths ?? []);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] ? d.errors[state.fields[k]] : undefined);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const next = [...photos];
    for (const f of Array.from(files).slice(0, 6 - photos.length)) {
      const res = await uploadImage("vehicles", userId, f, MAX_VEHICLE_PHOTO_BYTES);
      if ("path" in res) next.push(res.path);
      else toast.error(d.errors[res.error]);
    }
    setPhotos(next);
    setUploading(false);
    if (input.current) input.current.value = "";
  };

  return (
    <form onSubmit={action}>
      <Card className="space-y-5 p-5 sm:p-6">
        <input type="hidden" name="photos" value={JSON.stringify(photos)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={d.vehicles.type} htmlFor="type"><Select id="type" name="type" defaultValue={vehicle?.type ?? "sedan"}>{Object.entries(d.vehicles.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label={d.vehicles.seats} htmlFor="seats" hint={d.vehicles.seatsHint} error={err("seats")}><Select id="seats" name="seats" defaultValue={String(vehicle?.seats ?? 4)}>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
          <Field label={d.vehicles.brand} htmlFor="brand" error={err("brand")}><Input id="brand" name="brand" required maxLength={50} defaultValue={vehicle?.brand} placeholder="Peugeot, Renault, Kia…" /></Field>
          <Field label={d.vehicles.model} htmlFor="model" error={err("model")}><Input id="model" name="model" required maxLength={50} defaultValue={vehicle?.model} /></Field>
          <Field label={d.vehicles.color} htmlFor="color" error={err("color")}><Input id="color" name="color" required maxLength={30} defaultValue={vehicle?.color} /></Field>
          <Field label={d.vehicles.year} htmlFor="year" optional={d.common.optional} error={err("year")}><Input id="year" name="year" type="number" min={1970} max={new Date().getFullYear() + 1} defaultValue={vehicle?.year ?? ""} /></Field>
          <Field label={d.vehicles.plate} htmlFor="plate" hint={d.vehicles.plateHint} optional={d.common.optional} className="sm:col-span-2"><Input id="plate" name="plate" maxLength={20} defaultValue={vehicle?.plate_number ?? ""} placeholder="215 تونس 1234" /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">{d.vehicles.photos}</p>
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <div key={p} className="relative h-24 w-32 overflow-hidden rounded-xl ring-1 ring-slate-200">
                <Image src={publicUrl("vehicles", p)!} alt="" fill sizes="128px" className="object-cover" />
                <button type="button" onClick={() => setPhotos((xs) => xs.filter((x) => x !== p))} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label={d.vehicles.removePhoto}><X className="size-3.5" /></button>
              </div>
            ))}
            {photos.length < 6 && (
              <button type="button" onClick={() => input.current?.click()} disabled={uploading} className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-700">
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                {uploading ? d.vehicles.uploading : d.vehicles.addPhotos}
              </button>
            )}
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <p className="mt-1.5 text-xs text-slate-500">{d.vehicles.photoHint}</p>
        </div>
        {state && !state.ok && <FormError message={d.errors[state.error]} />}
        <div className="flex justify-end"><SubmitButton pending={pending} pendingLabel={d.common.saving}>{d.common.save}</SubmitButton></div>
      </Card>
    </form>
  );
}

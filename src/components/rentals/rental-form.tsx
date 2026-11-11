"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createRentalAction } from "@/actions/rentals";
import { useI18n } from "@/lib/i18n/client";
import { useFormAction, withNetworkError } from "@/lib/use-form-action";
import { publicUrl, MAX_VEHICLE_PHOTO_BYTES } from "@/lib/storage";
import { uploadImage } from "@/lib/upload";
import type { LocationLite } from "@/lib/location-lite";
import { Card } from "@/components/ui/card";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";
import { LocationCombobox } from "@/components/search/location-combobox";

export function RentalForm({ userId, locations, defaultPhone }: { userId: string; locations: LocationLite[]; defaultPhone?: string }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(withNetworkError(createRentalAction));
  const [photos, setPhotos] = useState<string[]>([]);
  const [city, setCity] = useState<LocationLite | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] ? d.errors[state.fields[k]] : undefined);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const next = [...photos];
    for (const f of Array.from(files).slice(0, 6 - photos.length)) {
      const res = await uploadImage("rentals", userId, f, MAX_VEHICLE_PHOTO_BYTES);
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
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{d.rentals.licenceNotice}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={d.rentals.agency} htmlFor="agencyName" error={err("agencyName")}><Input id="agencyName" name="agencyName" required minLength={2} maxLength={100} /></Field>
          <Field label={d.rentals.licence} htmlFor="licence" error={err("licence")}><Input id="licence" name="licence" required minLength={3} maxLength={50} dir="ltr" /></Field>
          <Field label={d.vehicles.type} htmlFor="type"><Select id="type" name="type" defaultValue="sedan">{Object.entries(d.vehicles.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label={d.vehicles.seats} htmlFor="seats" error={err("seats")}><Select id="seats" name="seats" defaultValue="5">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
          <Field label={d.vehicles.brand} htmlFor="brand" error={err("brand")}><Input id="brand" name="brand" required maxLength={50} placeholder="Peugeot, Kia…" /></Field>
          <Field label={d.vehicles.model} htmlFor="model" optional={d.common.optional} error={err("model")}><Input id="model" name="model" maxLength={50} /></Field>
          <Field label={d.vehicles.year} htmlFor="year" optional={d.common.optional} error={err("year")}><Input id="year" name="year" type="number" min={1970} max={new Date().getFullYear() + 1} /></Field>
          <Field label={d.rentals.phone} htmlFor="phone" hint={d.rentals.phoneHint} error={err("phone")}><Input id="phone" name="phone" type="tel" required defaultValue={defaultPhone} dir="ltr" placeholder="22 123 456" /></Field>
          <Field label={d.rentals.area} htmlFor="rental-city" error={err("locationId")} className="sm:col-span-2">
            <LocationCombobox id="rental-city" name="locationId" locations={locations} value={city} onChange={setCity} placeholder={d.search.placeholderFrom} invalid={!!err("locationId")} />
          </Field>
          <Field label={d.rentals.availability} htmlFor="availability" optional={d.common.optional} className="sm:col-span-2"><Input id="availability" name="availability" maxLength={300} placeholder={d.rentals.availabilityPlaceholder} /></Field>
          <Field label={d.rentals.conditions} htmlFor="conditions" optional={d.common.optional} className="sm:col-span-2"><Textarea id="conditions" name="conditions" maxLength={1500} placeholder={d.rentals.conditionsPlaceholder} /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">{d.rentals.photos}</p>
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <div key={p} className="relative h-24 w-32 overflow-hidden rounded-xl ring-1 ring-slate-200">
                <Image src={publicUrl("rentals", p)!} alt="" fill sizes="128px" className="object-cover" />
                <button type="button" onClick={() => setPhotos((xs) => xs.filter((x) => x !== p))} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label={d.vehicles.removePhoto}><X className="size-3.5" /></button>
              </div>
            ))}
            {photos.length < 6 && (
              <button type="button" onClick={() => input.current?.click()} disabled={uploading} className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-accent-400 hover:text-accent-700">
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                {uploading ? d.vehicles.uploading : d.vehicles.addPhotos}
              </button>
            )}
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          {err("photos") ? <p className="mt-1.5 text-sm text-red-600" role="alert">{d.rentals.photosRequired}</p> : <p className="mt-1.5 text-xs text-slate-500">{d.rentals.photosHint}</p>}
        </div>
        {state && !state.ok && <FormError message={d.errors[state.error]} />}
        <div className="flex justify-end"><SubmitButton pending={pending || uploading} pendingLabel={d.common.saving}>{d.rentals.submit}</SubmitButton></div>
      </Card>
    </form>
  );
}

"use client";
import { useFormAction } from "@/lib/use-form-action";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Route as RouteIcon } from "lucide-react";
import { saveTripAction } from "@/actions/trips";
import { useI18n } from "@/lib/i18n/client";
import { fmt, formatDuration, formatPrice, plural } from "@/lib/i18n/format";
import type { LocationLite } from "@/lib/location-lite";
import { fetchRoute, suggestPrice, type LatLng } from "@/lib/routing";
import { LocationPicker } from "@/components/map";
import { LocationCombobox } from "@/components/search/location-combobox";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";
import type { LuggageSize } from "@/lib/supabase/database.types";

export type TripFormVehicle = { id: string; brand: string; model: string; seats: number; is_active: boolean };
export type TripFormInitial = {
  originId: string; destinationId: string; originAddress: string; destinationAddress: string;
  origin: LatLng; destination: LatLng; date: string; time: string; seats: number; price: number;
  vehicleId: string | null; luggage: LuggageSize; description: string;
};

export function TripForm({ tripId, locations, vehicles, initial, bookedSeats = 0, defaultOriginSlug, defaultDate, minDate }: { tripId?: string; locations: LocationLite[]; vehicles: TripFormVehicle[]; initial?: TripFormInitial; bookedSeats?: number; defaultOriginSlug?: string; defaultDate: string; minDate: string }) {
  const { d, locale } = useI18n();
  const [state, action, pending] = useFormAction(saveTripAction.bind(null, tripId ?? null));
  const byId = (id?: string | null) => locations.find((l) => l.id === id) ?? null;
  const [origin, setOrigin] = useState<LocationLite | null>(initial ? byId(initial.originId) : locations.find((l) => l.slug === defaultOriginSlug) ?? null);
  const [destination, setDestination] = useState<LocationLite | null>(byId(initial?.destinationId));
  const [oPoint, setOPoint] = useState<LatLng | null>(initial?.origin ?? (origin ? { lat: origin.lat, lng: origin.lng } : null));
  const [dPoint, setDPoint] = useState<LatLng | null>(initial?.destination ?? null);
  const routeKey = oPoint && dPoint ? `${oPoint.lat},${oPoint.lng};${dPoint.lat},${dPoint.lng}` : null;
  const [resolved, setResolved] = useState<{ key: string; route: { km: number; min: number } | null } | null>(null);
  const route = resolved && resolved.key === routeKey ? resolved.route : null;
  const routing = Boolean(routeKey) && resolved?.key !== routeKey;
  const activeVehicles = vehicles.filter((v) => v.is_active || v.id === initial?.vehicleId);
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? activeVehicles[0]?.id ?? "new");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const routeLocked = Boolean(tripId && bookedSeats > 0);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] ? d.errors[state.fields[k]] : undefined);
  const vehicleSeats = vehicles.find((v) => v.id === vehicleId)?.seats ?? 8;

  useEffect(() => {
    if (!oPoint || !dPoint || !routeKey) return;
    const ctrl = new AbortController();
    fetchRoute(oPoint, dPoint, ctrl.signal)
      .then((r) => setResolved({ key: routeKey, route: { km: r.distanceKm, min: r.durationMin } }))
      .catch((e) => { if (!ctrl.signal.aborted) setResolved({ key: routeKey, route: null }); void e; });
    return () => ctrl.abort();
  }, [oPoint, dPoint, routeKey]);

  const pickCity = (which: "o" | "d") => (l: LocationLite | null) => {
    if (which === "o") { setOrigin(l); setOPoint(l ? { lat: l.lat, lng: l.lng } : null); }
    else { setDestination(l); setDPoint(l ? { lat: l.lat, lng: l.lng } : null); }
  };

  const pointBlock = (which: "o" | "d") => {
    const city = which === "o" ? origin : destination;
    const point = which === "o" ? oPoint : dPoint;
    const set = which === "o" ? setOPoint : setDPoint;
    const prefix = which === "o" ? "origin" : "destination";
    return (
      <div className="space-y-3">
        <Field label={which === "o" ? d.tripForm.originCity : d.tripForm.destinationCity} htmlFor={`${prefix}-city`} error={err(`${prefix}Id`)}>
          {routeLocked ? (
            <p className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"><Lock className="size-4 text-slate-400" aria-hidden />{city ? (locale === "ar" ? city.name_ar : locale === "en" ? city.name_en : city.name_fr) : ""}</p>
          ) : (
            <LocationCombobox id={`${prefix}-city`} locations={locations} value={city} onChange={pickCity(which)} placeholder={d.tripForm.selectCity} invalid={!!err(`${prefix}Id`)} />
          )}
          <input type="hidden" name={`${prefix}Id`} value={city?.id ?? ""} />
        </Field>
        <Field label={which === "o" ? d.tripForm.originAddress : d.tripForm.destinationAddress} htmlFor={`${prefix}-address`} error={err(`${prefix}Address`)}>
          <Input id={`${prefix}-address`} name={`${prefix}Address`} required minLength={2} maxLength={200} defaultValue={which === "o" ? initial?.originAddress : initial?.destinationAddress} placeholder={d.tripForm.addressPlaceholder} aria-invalid={!!err(`${prefix}Address`)} />
        </Field>
        {city && point && (
          <div>
            <div className="h-56 overflow-hidden rounded-xl ring-1 ring-slate-200">
              <LocationPicker className="h-full w-full" value={point} center={{ lat: city.lat, lng: city.lng }} onChange={set} variant={which === "o" ? "origin" : "destination"} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{d.tripForm.mapHint}</p>
          </div>
        )}
        <input type="hidden" name={`${prefix}Lat`} value={point?.lat ?? ""} />
        <input type="hidden" name={`${prefix}Lng`} value={point?.lng ?? ""} />
      </div>
    );
  };

  return (
    <form onSubmit={action} className="space-y-6">
      <Card>
        <CardHeader title={d.tripForm.route} description={routeLocked ? d.tripForm.routeLocked : undefined} />
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
          {pointBlock("o")}
          {pointBlock("d")}
        </div>
        {(route || routing) && (
          <p className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-sm text-slate-600 sm:px-6">
            <RouteIcon className="size-4 text-brand-600" aria-hidden />
            {routing ? d.tripForm.calculating : fmt(d.tripForm.routeInfo, { km: fmt(d.units.km, { count: route!.km }), duration: formatDuration(route!.min, locale) })}
          </p>
        )}
        <input type="hidden" name="distanceKm" value={route?.km ?? ""} />
        <input type="hidden" name="durationMin" value={route?.min ?? ""} />
      </Card>

      <Card>
        <CardHeader title={d.tripForm.schedule} />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <Field label={d.tripForm.date} htmlFor="date" error={err("date")}>
            <Input id="date" name="date" type="date" required min={minDate} defaultValue={initial?.date ?? defaultDate} />
          </Field>
          <Field label={d.tripForm.time} htmlFor="time" error={err("time")}>
            <Input id="time" name="time" type="time" required defaultValue={initial?.time ?? "08:00"} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={d.tripForm.vehicle} />
        <div className="space-y-4 p-5 sm:p-6">
          <Field label={d.tripForm.vehicleSelect} htmlFor="vehicleId">
            <Select id="vehicleId" name="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {activeVehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} · {plural(d.units.seats, v.seats, locale)}</option>)}
              <option value="new">{d.tripForm.newVehicle}</option>
            </Select>
          </Field>
          {vehicleId === "new" && (
            <div className="grid gap-4 rounded-2xl bg-sand-100 p-4 sm:grid-cols-2">
              <p className="font-semibold sm:col-span-2">{d.tripForm.newVehicleTitle}</p>
              <Field label={d.vehicles.type} htmlFor="vType"><Select id="vType" name="vType" defaultValue="sedan">{Object.entries(d.vehicles.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label={d.vehicles.seats} htmlFor="vSeats" error={err("vSeats")}><Select id="vSeats" name="vSeats" defaultValue="4">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
              <Field label={d.vehicles.brand} htmlFor="vBrand" error={err("vBrand")}><Input id="vBrand" name="vBrand" required maxLength={50} placeholder="Peugeot" /></Field>
              <Field label={d.vehicles.model} htmlFor="vModel" error={err("vModel")}><Input id="vModel" name="vModel" required maxLength={50} placeholder="301" /></Field>
              <Field label={d.vehicles.color} htmlFor="vColor" error={err("vColor")}><Input id="vColor" name="vColor" required maxLength={30} /></Field>
              <Field label={d.vehicles.year} htmlFor="vYear" optional={d.common.optional}><Input id="vYear" name="vYear" type="number" min={1970} max={new Date().getFullYear() + 1} /></Field>
              <Field label={d.vehicles.plate} htmlFor="vPlate" hint={d.vehicles.plateHint} optional={d.common.optional} className="sm:col-span-2"><Input id="vPlate" name="vPlate" maxLength={20} placeholder="215 تونس 1234" /></Field>
            </div>
          )}
          <p className="text-xs text-slate-500"><Link href="/dashboard/vehicles" className="underline">{d.nav.vehicles}</Link></p>
        </div>
      </Card>

      <Card>
        <CardHeader title={d.tripForm.seatsPrice} />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <Field label={d.tripForm.seats} htmlFor="seats" error={err("seats")} hint={bookedSeats ? plural(d.tripForm.seatsLocked, bookedSeats, locale) : undefined}>
            <Select id="seats" name="seats" defaultValue={String(initial?.seats ?? Math.min(3, vehicleSeats))}>
              {Array.from({ length: vehicleId === "new" ? 8 : vehicleSeats }, (_, i) => i + 1).filter((n) => n >= Math.max(1, bookedSeats)).map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label={d.tripForm.price} htmlFor="price" error={err("price")} hint={route ? (
            <button type="button" className="text-brand-700 underline" onClick={() => setPrice(String(suggestPrice(route.km)))}>
              {fmt(d.tripForm.priceHint, { price: formatPrice(suggestPrice(route.km), locale), km: route.km })}
            </button>
          ) : undefined}>
            <Input id="price" name="price" type="number" inputMode="decimal" step="0.5" min={1} max={500} required value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!!err("price")} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={d.tripForm.extra} />
        <div className="space-y-4 p-5 sm:p-6">
          <Field label={d.tripForm.luggage} htmlFor="luggage">
            <Select id="luggage" name="luggage" defaultValue={initial?.luggage ?? "medium"}>
              {(["none", "small", "medium", "large"] as const).map((k) => <option key={k} value={k}>{d.trip.luggageSizes[k]}</option>)}
            </Select>
          </Field>
          <Field label={d.tripForm.description} htmlFor="description" optional={d.common.optional}>
            <Textarea id="description" name="description" maxLength={1000} defaultValue={initial?.description} placeholder={d.tripForm.descriptionPlaceholder} />
          </Field>
        </div>
      </Card>

      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      <div className="flex justify-end">
        <SubmitButton pending={pending} size="lg" pendingLabel={d.common.saving}>{tripId ? d.tripForm.submitEdit : d.tripForm.submitNew}</SubmitButton>
      </div>
    </form>
  );
}

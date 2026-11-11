"use client";
import { useFormAction } from "@/lib/use-form-action";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Car, ChevronDown, Lock, MapPin, Minus, Phone, Plus, Route as RouteIcon, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { saveTripAction } from "@/actions/trips";
import { useI18n } from "@/lib/i18n/client";
import { fmt, formatDuration, formatPrice, plural } from "@/lib/i18n/format";
import type { LocationLite } from "@/lib/location-lite";
import { formatTunisianPhone } from "@/lib/phone";
import { vehicleName } from "@/lib/names";
import { fetchRoute, suggestPrice, type LatLng } from "@/lib/routing";
import { LocationPicker } from "@/components/map";
import { LocationCombobox } from "@/components/search/location-combobox";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";
import type { LuggageSize } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type TripFormVehicle = { id: string; brand: string | null; model: string; seats: number; is_active: boolean };
export type TripFormInitial = {
  originId: string; destinationId: string; originAddress: string; destinationAddress: string;
  origin: LatLng; destination: LatLng; date: string; time: string; seats: number; price: number;
  vehicleId: string | null; luggage: LuggageSize; description: string;
};

export function TripForm({ tripId, locations, vehicles, initial, bookedSeats = 0, defaultOriginSlug, defaultDestinationSlug, defaultDate, minDate, driverPhone, driverPhonePublic }: { driverPhone?: string; driverPhonePublic?: boolean; tripId?: string; locations: LocationLite[]; vehicles: TripFormVehicle[]; initial?: TripFormInitial; bookedSeats?: number; defaultOriginSlug?: string; defaultDestinationSlug?: string; defaultDate: string; minDate: string }) {
  const { d, locale } = useI18n();
  const [state, action, pending] = useFormAction(saveTripAction.bind(null, tripId ?? null));
  const byId = (id?: string | null) => locations.find((l) => l.id === id) ?? null;
  const [origin, setOrigin] = useState<LocationLite | null>(initial ? byId(initial.originId) : locations.find((l) => l.slug === defaultOriginSlug) ?? null);
  const [destination, setDestination] = useState<LocationLite | null>(initial ? byId(initial.destinationId) : locations.find((l) => l.slug === defaultDestinationSlug) ?? null);
  const [oPoint, setOPoint] = useState<LatLng | null>(initial?.origin ?? (origin ? { lat: origin.lat, lng: origin.lng } : null));
  const [dPoint, setDPoint] = useState<LatLng | null>(initial?.destination ?? (!initial && destination ? { lat: destination.lat, lng: destination.lng } : null));
  const routeKey = oPoint && dPoint ? `${oPoint.lat},${oPoint.lng};${dPoint.lat},${dPoint.lng}` : null;
  const [resolved, setResolved] = useState<{ key: string; route: { km: number; min: number } | null } | null>(null);
  const route = resolved && resolved.key === routeKey ? resolved.route : null;
  const routing = Boolean(routeKey) && resolved?.key !== routeKey;
  const activeVehicles = vehicles.filter((v) => v.is_active || v.id === initial?.vehicleId);
  const [vehicleId, setVehicleId] = useState(initial ? initial.vehicleId ?? "" : activeVehicles[0]?.id ?? "");
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

  const cityName = (c: LocationLite | null) => (c ? (locale === "ar" ? c.name_ar : locale === "en" ? c.name_en : c.name_fr) : "");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const tomorrow = new Date(Date.parse(`${minDate}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const maxSeats = vehicleId === "new" ? 8 : vehicleSeats;
  const minSeats = Math.max(1, bookedSeats);
  const [seats, setSeats] = useState(initial?.seats ?? Math.min(3, vehicleSeats));
  const seatCount = Math.min(Math.max(seats, minSeats), maxSeats);
  const [showMap, setShowMap] = useState<"o" | "d" | null>(null);

  const stop = (which: "o" | "d") => {
    const city = which === "o" ? origin : destination;
    const point = which === "o" ? oPoint : dPoint;
    const set = which === "o" ? setOPoint : setDPoint;
    const prefix = which === "o" ? "origin" : "destination";
    return (
      <div className="relative flex gap-3">
        <span className={cn("mt-3.5 size-4 shrink-0 rounded-full border-4 bg-white", which === "o" ? "border-brand-600" : "border-accent-500")} aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <Field label={which === "o" ? d.tripForm.originCity : d.tripForm.destinationCity} htmlFor={`${prefix}-city`} error={err(`${prefix}Id`)}>
            {routeLocked ? (
              <p className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"><Lock className="size-4 text-slate-400" aria-hidden />{cityName(city)}</p>
            ) : (
              <LocationCombobox id={`${prefix}-city`} locations={locations} value={city} onChange={pickCity(which)} placeholder={d.tripForm.selectCity} invalid={!!err(`${prefix}Id`)} />
            )}
            <input type="hidden" name={`${prefix}Id`} value={city?.id ?? ""} />
          </Field>
          <Field label={which === "o" ? d.tripForm.originAddress : d.tripForm.destinationAddress} htmlFor={`${prefix}-address`} optional={d.common.optional} error={err(`${prefix}Address`)}>
            <Input id={`${prefix}-address`} name={`${prefix}Address`} minLength={2} maxLength={200} defaultValue={which === "o" ? initial?.originAddress : initial?.destinationAddress} placeholder={d.tripForm.addressPlaceholder} aria-invalid={!!err(`${prefix}Address`)} />
          </Field>
          {city && point && (
            showMap === which ? (
              <div>
                <div className="h-56 overflow-hidden rounded-xl ring-1 ring-slate-200">
                  <LocationPicker className="h-full w-full" value={point} center={{ lat: city.lat, lng: city.lng }} onChange={set} variant={which === "o" ? "origin" : "destination"} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{d.tripForm.mapHint}</p>
              </div>
            ) : (
              <button type="button" onClick={() => setShowMap(which)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><MapPin className="size-4" aria-hidden />{d.tripForm.showMap}</button>
            )
          )}
          <input type="hidden" name={`${prefix}Lat`} value={point?.lat ?? ""} />
          <input type="hidden" name={`${prefix}Lng`} value={point?.lng ?? ""} />
        </div>
      </div>
    );
  };

  const chip = (on: boolean) => cn("h-11 rounded-xl px-4 text-sm font-semibold transition", on ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200");

  return (
    <form onSubmit={action} className="space-y-4 pb-24 sm:pb-0">
      {/* 1 · Route */}
      <Step n={1} icon={<RouteIcon className="size-5" aria-hidden />} title={d.tripForm.route} note={routeLocked ? d.tripForm.routeLocked : undefined}>
        <div className="relative space-y-4">
          <span className="absolute start-[7px] top-8 bottom-24 w-0.5 bg-slate-200" aria-hidden />
          {stop("o")}
          {stop("d")}
        </div>
        {(route || routing) && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800">
            <RouteIcon className="size-4" aria-hidden />
            {routing ? d.tripForm.calculating : fmt(d.tripForm.routeInfo, { km: fmt(d.units.km, { count: route!.km }), duration: formatDuration(route!.min, locale) })}
          </p>
        )}
        <input type="hidden" name="distanceKm" value={route?.km ?? ""} />
        <input type="hidden" name="durationMin" value={route?.min ?? ""} />
      </Step>

      {/* 2 · When */}
      <Step n={2} icon={<CalendarDays className="size-5" aria-hidden />} title={d.tripForm.schedule}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(date === minDate)} onClick={() => setDate(minDate)}>{d.dest.today}</button>
          <button type="button" className={chip(date === tomorrow)} onClick={() => setDate(tomorrow)}>{d.dest.tomorrow}</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={d.tripForm.date} htmlFor="date" error={err("date")}>
            <Input id="date" name="date" type="date" required min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="min-w-0" />
          </Field>
          <Field label={d.tripForm.time} htmlFor="time" error={err("time")}>
            <Input id="time" name="time" type="time" required defaultValue={initial?.time ?? "08:00"} className="min-w-0" />
          </Field>
        </div>
      </Step>

      {/* 3 · Seats & price */}
      <Step n={3} icon={<Users className="size-5" aria-hidden />} title={d.tripForm.seatsPrice}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">{d.tripForm.seats}</p>
            <div className="flex h-12 items-center justify-between rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={() => setSeats(seatCount - 1)} disabled={seatCount <= minSeats} className="flex size-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm disabled:opacity-40" aria-label="−"><Minus className="size-5" aria-hidden /></button>
              <output className="text-xl font-extrabold tabular-nums" aria-live="polite">{seatCount}</output>
              <button type="button" onClick={() => setSeats(seatCount + 1)} disabled={seatCount >= maxSeats} className="flex size-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm disabled:opacity-40" aria-label="+"><Plus className="size-5" aria-hidden /></button>
            </div>
            <input type="hidden" name="seats" value={seatCount} />
            {err("seats") ? <p className="mt-1.5 text-sm text-red-600" role="alert">{err("seats")}</p> : bookedSeats > 0 && <p className="mt-1.5 text-xs text-slate-500">{plural(d.tripForm.seatsLocked, bookedSeats, locale)}</p>}
          </div>
          <Field label={d.tripForm.price} htmlFor="price" error={err("price")}>
            <div className="relative">
              <Input id="price" name="price" type="number" inputMode="decimal" step="0.5" min={1} max={500} required value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!!err("price")} className="pe-14 text-lg font-bold" />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">{d.tripForm.currency}</span>
            </div>
            {route && (
              <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1 text-sm font-semibold text-accent-700" onClick={() => setPrice(String(suggestPrice(route.km)))}>
                <Sparkles className="size-4" aria-hidden />{fmt(d.tripForm.priceHint, { price: formatPrice(suggestPrice(route.km), locale), km: route.km })}
              </button>
            )}
          </Field>
        </div>
      </Step>

      {/* 4 · Car */}
      <Step n={4} icon={<Car className="size-5" aria-hidden />} title={d.tripForm.vehicle} optional={d.common.optional}>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={d.tripForm.vehicleSelect}>
          {[...activeVehicles.map((v) => ({ id: v.id, label: vehicleName(v), sub: plural(d.units.seats, v.seats, locale) })), { id: "", label: d.tripForm.noVehicle, sub: "" }, { id: "new", label: d.tripForm.newVehicle, sub: "" }].map((o) => (
            <label key={o.id || "none"} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 transition", vehicleId === o.id ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300")}>
              <input type="radio" name="vehicleId" value={o.id} checked={vehicleId === o.id} onChange={() => setVehicleId(o.id)} className="size-4 accent-brand-600" />
              <span className="min-w-0"><span className="block truncate font-semibold">{o.label}</span>{o.sub && <span className="block text-xs text-slate-500">{o.sub}</span>}</span>
            </label>
          ))}
        </div>
        {vehicleId === "new" && (
          <div className="mt-3 space-y-3 rounded-2xl bg-sand-100 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={d.vehicles.brand} htmlFor="vBrand" optional={d.common.optional} error={err("vBrand")}><Input id="vBrand" name="vBrand" maxLength={50} placeholder="Peugeot" /></Field>
              <Field label={d.vehicles.model} htmlFor="vModel" error={err("vModel")}><Input id="vModel" name="vModel" required maxLength={50} placeholder="301" /></Field>
              <Field label={d.vehicles.seats} htmlFor="vSeats" error={err("vSeats")} className="col-span-2"><Select id="vSeats" name="vSeats" defaultValue="4">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            </div>
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">{d.tripForm.moreVehicle}</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label={d.vehicles.type} htmlFor="vType" optional={d.common.optional}><Select id="vType" name="vType" defaultValue=""><option value="">—</option>{Object.entries(d.vehicles.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label={d.vehicles.color} htmlFor="vColor" optional={d.common.optional} error={err("vColor")}><Input id="vColor" name="vColor" maxLength={30} /></Field>
                <Field label={d.vehicles.year} htmlFor="vYear" optional={d.common.optional}><Input id="vYear" name="vYear" type="number" min={1970} max={new Date().getFullYear() + 1} /></Field>
                <Field label={d.vehicles.plate} htmlFor="vPlate" optional={d.common.optional}><Input id="vPlate" name="vPlate" maxLength={20} placeholder="215 تونس 1234" /></Field>
              </div>
            </details>
          </div>
        )}
      </Step>

      {/* Optional extras, folded away */}
      <details className="group rounded-[var(--radius-card)] border border-slate-200 bg-white" open={Boolean(initial?.description)}>
        <summary className="flex cursor-pointer items-center gap-2 p-4 font-semibold sm:px-6">
          <SlidersHorizontal className="size-5 text-slate-500" aria-hidden />{d.tripForm.extra}<span className="text-sm font-normal text-slate-400">({d.common.optional})</span>
          <ChevronDown className="ms-auto size-5 text-slate-400 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-4 sm:p-6">
          <Field label={d.tripForm.luggage} htmlFor="luggage">
            <Select id="luggage" name="luggage" defaultValue={initial?.luggage ?? "medium"}>
              {(["none", "small", "medium", "large"] as const).map((k) => <option key={k} value={k}>{d.trip.luggageSizes[k]}</option>)}
            </Select>
          </Field>
          <Field label={d.tripForm.description} htmlFor="description" optional={d.common.optional}>
            <Textarea id="description" name="description" maxLength={1000} defaultValue={initial?.description} placeholder={d.tripForm.descriptionPlaceholder} />
          </Field>
        </div>
      </details>

      {driverPhone && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-slate-600">
          <Phone className="size-4 shrink-0 text-brand-700" aria-hidden />
          <span>{fmt(driverPhonePublic ? d.tripForm.phoneGate.shownPublic : d.tripForm.phoneGate.shown, { phone: "" })}<bdi dir="ltr" className="font-semibold text-slate-900">{formatTunisianPhone(driverPhone)}</bdi></span>
          <Link href="/dashboard/profile" className="font-semibold text-brand-700 underline underline-offset-2">{d.tripForm.phoneGate.change}</Link>
        </p>
      )}
      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      {state && !state.ok && state.error === "publish_phone_required" && <Link href="/dashboard/profile" className="block text-sm font-semibold text-brand-700 underline">{d.nav.profile}</Link>}

      {/* Publish: fixed at the bottom on phones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="flex justify-end">
          <SubmitButton pending={pending} size="lg" className="w-full sm:w-auto" pendingLabel={d.common.saving}>{tripId ? d.tripForm.submitEdit : d.tripForm.submitNew}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function Step({ n, icon, title, note, optional, children }: { n: number; icon: React.ReactNode; title: string; note?: string; optional?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-bold">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
          <span className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{n}</span>
        </span>
        {title}
        {optional && <span className="text-sm font-normal text-slate-400">({optional})</span>}
      </h2>
      {note && <p className="-mt-2 mb-4 text-sm text-slate-500">{note}</p>}
      {children}
    </section>
  );
}

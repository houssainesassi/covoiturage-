"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fail, toErrorCode, type ActionResult, type ErrorCode } from "@/lib/errors";
import { tripSchema, vehicleSchema } from "@/lib/validation";
import { tunisLocalToISO } from "@/lib/i18n/format";
import { TN_PHONE_REGEX, isPhoneVerified } from "@/lib/phone";
import { authed, result } from "./_util";

export async function saveTripAction(tripId: string | null, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { supabase, userId } = ctx;

  // Confirmed passengers must be able to call the driver: no valid phone number, no ride.
  const { data: priv, error: phoneError } = await supabase.from("profile_private").select("phone").eq("id", userId).maybeSingle();
  if (phoneError) return fail(toErrorCode(phoneError));
  if (!priv?.phone || !TN_PHONE_REGEX.test(priv.phone)) return fail("publish_phone_required");
  // New rides only: drivers with rides from before phone verification can still edit them.
  if (!tripId) {
    const { data: u } = await supabase.auth.getUser();
    if (!isPhoneVerified(u.user, priv.phone)) return fail("phone_unverified");
  }

  const parsed = tripSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    const fields: Record<string, ErrorCode> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] = "validation";
    return fail("validation", fields);
  }
  const v = parsed.data;
  if (v.originId === v.destinationId) return fail("same_city", { destinationId: "same_city" });

  let vehicleId: string | null = v.vehicleId && v.vehicleId !== "new" && v.vehicleId !== "" ? v.vehicleId : null;
  if (v.vehicleId === "new") {
    const vp = vehicleSchema.safeParse({
      type: fd.get("vType"), brand: fd.get("vBrand") || undefined, model: fd.get("vModel"),
      color: fd.get("vColor") || undefined, year: fd.get("vYear") || undefined, seats: fd.get("vSeats"), plate: fd.get("vPlate") || undefined,
    });
    if (!vp.success) {
      const fields: Record<string, ErrorCode> = {};
      for (const i of vp.error.issues) fields["v" + String(i.path[0]).replace(/^./, (c) => c.toUpperCase())] = "validation";
      return fail("validation", fields);
    }
    const { data: veh, error } = await supabase
      .from("vehicles")
      .insert({ owner_id: userId, type: vp.data.type, brand: vp.data.brand, model: vp.data.model, color: vp.data.color, year: vp.data.year ?? null, seats: vp.data.seats, plate_number: vp.data.plate })
      .select("id")
      .single();
    if (error) return fail(toErrorCode(error));
    vehicleId = veh.id;
  }

  const row = {
    origin_id: v.originId,
    destination_id: v.destinationId,
    origin_address: v.originAddress,
    destination_address: v.destinationAddress,
    origin_lat: v.originLat,
    origin_lng: v.originLng,
    destination_lat: v.destinationLat,
    destination_lng: v.destinationLng,
    departure_at: tunisLocalToISO(v.date, v.time),
    seats_total: v.seats,
    price_per_seat: Math.round(v.price * 1000) / 1000,
    vehicle_id: vehicleId,
    luggage_size: v.luggage,
    description: v.description,
    distance_km: v.distanceKm ?? null,
    duration_min: v.durationMin ?? null,
  };

  let id = tripId;
  if (tripId) {
    const { error, count } = await supabase.from("trips").update(row, { count: "exact" }).eq("id", tripId).eq("driver_id", userId);
    if (error) return fail(toErrorCode(error));
    if (!count) return fail("forbidden");
  } else {
    const { data, error } = await supabase.from("trips").insert({ ...row, driver_id: userId }).select("id").single();
    if (error) return fail(toErrorCode(error));
    id = data.id;
  }
  revalidatePath("/dashboard/trips");
  redirect(`/dashboard/trips/${id}?toast=${tripId ? "trip_updated" : "trip_created"}`);
}

export async function cancelTripAction(tripId: string, reason?: string): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("cancel_trip", { p_trip_id: tripId, p_reason: reason?.slice(0, 500) || null });
  revalidatePath(`/dashboard/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}`);
  return result(error);
}

export async function completeTripAction(tripId: string): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("complete_trip", { p_trip_id: tripId });
  revalidatePath(`/dashboard/trips/${tripId}`);
  return result(error);
}

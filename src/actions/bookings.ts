"use server";
import { revalidatePath } from "next/cache";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { bookingSchema } from "@/lib/validation";
import { isPhoneVerified } from "@/lib/phone";
import { authed, result } from "./_util";

export async function requestBookingAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const parsed = bookingSchema.safeParse({ tripId: fd.get("tripId"), seats: fd.get("seats"), message: fd.get("message") || undefined });
  if (!parsed.success) return fail("invalid_seats");
  // Also enforced by the booking trigger (migration 14).
  const [{ data: u }, { data: priv }] = await Promise.all([
    ctx.supabase.auth.getUser(),
    ctx.supabase.from("profile_private").select("phone").eq("id", ctx.userId).maybeSingle(),
  ]);
  if (!isPhoneVerified(u.user, priv?.phone)) return fail("phone_unverified");
  // Price, availability and permissions are all enforced inside request_booking().
  const { error } = await ctx.supabase.rpc("request_booking", {
    p_trip_id: parsed.data.tripId,
    p_seats: parsed.data.seats,
    p_message: parsed.data.message,
  });
  if (error) return fail(toErrorCode(error));
  revalidatePath(`/trips/${parsed.data.tripId}`);
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

export async function respondBookingAction(bookingId: string, tripId: string, accept: boolean): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("respond_booking", { p_booking_id: bookingId, p_accept: accept });
  revalidatePath(`/dashboard/trips/${tripId}`);
  return result(error);
}

export async function cancelBookingAction(bookingId: string, reason?: string): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: reason?.slice(0, 500) || null });
  revalidatePath("/dashboard", "layout");
  return result(error);
}

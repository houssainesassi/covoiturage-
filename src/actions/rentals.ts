"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fail, toErrorCode, type ActionResult, type ErrorCode } from "@/lib/errors";
import { rentalsEnabled } from "@/lib/features";
import { rentalSchema, uuidSchema } from "@/lib/validation";
import type { RentalStatus } from "@/lib/supabase/database.types";
import { authed, result } from "./_util";

/** New listings always start as 'pending': the DB grants no write on status. */
export async function createRentalAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!rentalsEnabled()) return fail("forbidden");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { supabase, userId } = ctx;
  const parsed = rentalSchema.safeParse({
    agencyName: fd.get("agencyName"), licence: fd.get("licence"), type: fd.get("type"), brand: fd.get("brand"), model: fd.get("model") || undefined,
    year: fd.get("year") || undefined, seats: fd.get("seats"), locationId: fd.get("locationId"), phone: fd.get("phone"),
    conditions: fd.get("conditions") || undefined, availability: fd.get("availability") || undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, ErrorCode> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0]);
      fields[k] = k === "phone" && (i.message === "invalid_phone" || i.message === "phone_required") ? i.message : "validation";
    }
    return fail("validation", fields);
  }
  let photos: string[] = [];
  try {
    const raw = JSON.parse(String(fd.get("photos") ?? "[]"));
    if (Array.isArray(raw)) photos = raw.filter((p): p is string => typeof p === "string").slice(0, 6);
  } catch {
    return fail("validation");
  }
  if (photos.length === 0) return fail("validation", { photos: "validation" });
  if (photos.some((p) => !p.startsWith(`${userId}/`))) return fail("invalid_photo_path");
  const v = parsed.data;
  const { error } = await supabase.from("rental_listings").insert({
    owner_id: userId, agency_name: v.agencyName, licence_number: v.licence, vehicle_type: v.type, brand: v.brand, model: v.model,
    year: v.year ?? null, seats: v.seats, location_id: v.locationId, phone: v.phone, conditions: v.conditions, availability: v.availability, photo_paths: photos,
  });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/dashboard/rentals");
  redirect("/dashboard/rentals?toast=rental_saved");
}

export async function deleteRentalAction(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.from("rental_listings").delete().eq("id", id).eq("owner_id", ctx.userId);
  revalidatePath("/dashboard/rentals");
  revalidatePath("/rentals");
  return result(error);
}

/** Admin licence review; is_admin() is re-checked inside the RPC. */
export async function adminSetRentalStatusAction(id: string, status: RentalStatus, note?: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success || !["pending", "approved", "rejected", "hidden"].includes(status)) return fail("validation");
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.rpc("admin_set_rental_status", { p_id: id, p_status: status, p_note: note?.trim().slice(0, 500) || null });
  revalidatePath("/admin/rentals");
  revalidatePath("/rentals");
  return result(error);
}

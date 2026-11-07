"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fail, toErrorCode, type ActionResult, type ErrorCode } from "@/lib/errors";
import { vehicleSchema } from "@/lib/validation";
import { authed, result } from "./_util";

export async function saveVehicleAction(vehicleId: string | null, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { supabase, userId } = ctx;
  const parsed = vehicleSchema.safeParse({
    type: fd.get("type"), brand: fd.get("brand"), model: fd.get("model"), color: fd.get("color"),
    year: fd.get("year") || undefined, seats: fd.get("seats"), plate: fd.get("plate") || undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, ErrorCode> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] = "validation";
    return fail("validation", fields);
  }
  let photos: string[] = [];
  try {
    const raw = JSON.parse(String(fd.get("photos") ?? "[]"));
    if (Array.isArray(raw)) photos = raw.filter((p): p is string => typeof p === "string").slice(0, 6);
  } catch {
    return fail("validation");
  }
  // The DB trigger also verifies every path lives in the owner's folder.
  if (photos.some((p) => !p.startsWith(`${userId}/`))) return fail("invalid_photo_path");
  const v = parsed.data;
  const row = { type: v.type, brand: v.brand, model: v.model, color: v.color, year: v.year ?? null, seats: v.seats, plate_number: v.plate, photo_paths: photos };
  const { error } = vehicleId
    ? await supabase.from("vehicles").update(row).eq("id", vehicleId).eq("owner_id", userId)
    : await supabase.from("vehicles").insert({ ...row, owner_id: userId });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/dashboard/vehicles");
  redirect("/dashboard/vehicles?toast=vehicle_saved");
}

export async function deleteVehicleAction(vehicleId: string): Promise<ActionResult<"archived" | "deleted">> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { supabase, userId } = ctx;
  const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId).eq("owner_id", userId);
  revalidatePath("/dashboard/vehicles");
  if (error?.code === "23503") {
    const { error: e2 } = await supabase.from("vehicles").update({ is_active: false }).eq("id", vehicleId).eq("owner_id", userId);
    return e2 ? fail(toErrorCode(e2)) : { ok: true, data: "archived" };
  }
  return error ? fail(toErrorCode(error)) : { ok: true, data: "deleted" };
}

export async function setVehicleActiveAction(vehicleId: string, active: boolean): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.from("vehicles").update({ is_active: active }).eq("id", vehicleId).eq("owner_id", ctx.userId);
  revalidatePath("/dashboard/vehicles");
  return result(error);
}

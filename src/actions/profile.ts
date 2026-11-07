"use server";
import { revalidatePath } from "next/cache";
import { fail, toErrorCode, type ActionResult, type ErrorCode } from "@/lib/errors";
import { profileSchema } from "@/lib/validation";
import { authed, result } from "./_util";

export async function updateProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { supabase, userId } = ctx;
  const parsed = profileSchema.safeParse({
    fullName: fd.get("fullName"),
    phone: fd.get("phone") || undefined,
    bio: fd.get("bio") || undefined,
    cityId: fd.get("cityId") || undefined,
    dob: fd.get("dob") || undefined,
    prefSmoking: fd.get("prefSmoking") === "on",
    prefPets: fd.get("prefPets") === "on",
    prefMusic: fd.get("prefMusic") === "on",
    prefChatty: fd.get("prefChatty") === "on",
  });
  if (!parsed.success) {
    const fields: Record<string, ErrorCode> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] = i.message === "invalid_phone" ? "invalid_phone" : "validation";
    return fail(fields.phone ?? "validation", fields);
  }
  const v = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: v.fullName, bio: v.bio, city_id: v.cityId, pref_smoking: v.prefSmoking, pref_pets: v.prefPets, pref_music: v.prefMusic, pref_chatty: v.prefChatty })
    .eq("id", userId);
  if (error) return fail(toErrorCode(error));
  const { error: e2 } = await supabase.from("profile_private").upsert({ id: userId, phone: v.phone, date_of_birth: v.dob });
  if (e2) return fail(e2.code === "23514" ? "validation" : toErrorCode(e2), e2.code === "23514" ? { dob: "validation" } : undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateAvatarAction(path: string | null): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  if (path && !path.startsWith(`${ctx.userId}/`)) return fail("invalid_photo_path");
  const { error } = await ctx.supabase.from("profiles").update({ avatar_path: path }).eq("id", ctx.userId);
  revalidatePath("/", "layout");
  return result(error);
}

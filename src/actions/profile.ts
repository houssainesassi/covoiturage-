"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, toErrorCode, type ActionResult, type ErrorCode } from "@/lib/errors";
import { completeProfileSchema, phoneField, profileSchema } from "@/lib/validation";
import { safeNext } from "@/lib/utils";
import { authed, result, savePrivateProfile } from "./_util";

const issueCode = (message: string): ErrorCode =>
  message === "invalid_phone" || message === "phone_required" ? message : "validation";

export async function updateProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { supabase, userId } = ctx;
  const parsed = profileSchema.safeParse({
    fullName: fd.get("fullName"),
    phone: fd.get("phone") ?? "",
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
    for (const i of parsed.error.issues) fields[String(i.path[0])] = issueCode(i.message);
    return fail(fields.phone ?? "validation", fields);
  }
  const v = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: v.fullName, bio: v.bio, city_id: v.cityId, pref_smoking: v.prefSmoking, pref_pets: v.prefPets, pref_music: v.prefMusic, pref_chatty: v.prefChatty })
    .eq("id", userId);
  if (error) return fail(toErrorCode(error));
  const { error: e2 } = await savePrivateProfile(supabase, userId, { phone: v.phone, date_of_birth: v.dob });
  if (e2) return fail(e2.code === "23514" ? "validation" : toErrorCode(e2), e2.code === "23514" ? { dob: "validation" } : undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Lets a driver add their phone number right from the "publish a ride" page. */
export async function savePhoneAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const parsed = phoneField.safeParse(fd.get("phone") ?? "");
  if (!parsed.success) {
    const code = issueCode(parsed.error.issues[0]?.message ?? "");
    return fail(code === "validation" ? "invalid_phone" : code, { phone: code === "validation" ? "invalid_phone" : code });
  }
  const { error } = await savePrivateProfile(ctx.supabase, ctx.userId, { phone: parsed.data });
  if (error) return error.code === "23514" ? fail("invalid_phone", { phone: "invalid_phone" }) : fail(toErrorCode(error));
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function updateAvatarAction(path: string | null): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  // The avatar is mandatory: it can be replaced but not removed.
  if (!path) return fail("avatar_required");
  if (!path.startsWith(`${ctx.userId}/`)) return fail("invalid_photo_path");
  const { error } = await ctx.supabase.from("profiles").update({ avatar_path: path }).eq("id", ctx.userId);
  revalidatePath("/", "layout");
  return result(error);
}

/** Post-registration step: saves the mandatory profile fields, then opens the app. */
export async function completeProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await authed();
  if ("error" in ctx) return ctx.error;
  const { supabase, userId } = ctx;
  const parsed = completeProfileSchema.safeParse({
    fullName: fd.get("fullName"),
    phone: fd.get("phone") ?? "",
    avatarPath: fd.get("avatarPath") || undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, ErrorCode> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] = issueCode(i.message);
    return fail(fields.phone ?? fields.fullName ?? "validation", fields);
  }
  const v = parsed.data;
  if (v.avatarPath && !v.avatarPath.startsWith(`${userId}/`)) return fail("invalid_photo_path", { avatar: "invalid_photo_path" });

  const { data: current } = await supabase.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  const avatarPath = v.avatarPath ?? current?.avatar_path ?? null;
  if (!avatarPath) return fail("avatar_required", { avatar: "avatar_required" });

  const { error } = await supabase.from("profiles").update({ full_name: v.fullName, avatar_path: avatarPath }).eq("id", userId);
  if (error) return fail(toErrorCode(error));
  const { error: e2 } = await savePrivateProfile(supabase, userId, { phone: v.phone });
  if (e2) return fail(e2.code === "23514" ? "invalid_phone" : toErrorCode(e2), e2.code === "23514" ? { phone: "invalid_phone" } : undefined);

  const { data: complete, error: e3 } = await supabase.rpc("my_profile_complete");
  if (!e3 && !complete) return fail("profile_incomplete");
  revalidatePath("/", "layout");
  const next = safeNext(String(fd.get("next") ?? ""), "/");
  redirect(next.startsWith("/auth") ? "/" : next);
}

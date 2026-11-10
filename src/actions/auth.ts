"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { normalizeTunisianPhone } from "@/lib/phone";
import { getOrigin, getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { z } from "zod";

async function guard(key: string, max: number) {
  if (!isSupabaseConfigured()) return fail("not_configured");
  const ip = await getClientIp();
  if (!rateLimit(`${key}:${ip}`, max, 10 * 60 * 1000)) return fail("rate_limited");
  return null;
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("login", 20);
  if (blocked) return blocked;
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return fail("invalid_credentials");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail(toErrorCode(error));
  revalidatePath("/", "layout");
  redirect(safeNext(String(fd.get("next") ?? "")));
}

export async function registerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("register", 8);
  if (blocked) return blocked;
  const raw = {
    fullName: fd.get("fullName"),
    email: fd.get("email"),
    phone: fd.get("phone") ?? "",
    password: fd.get("password"),
    confirm: fd.get("confirm"),
    terms: fd.get("terms"),
  };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, ReturnType<typeof toErrorCode>> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0]);
      fields[k] = k === "email" ? "invalid_email" : k === "password" ? "weak_password" : k === "terms" ? "terms_required" : k === "phone" ? "phone_required" : "validation";
    }
    if (!fields.phone && !normalizeTunisianPhone(String(raw.phone))) fields.phone = "invalid_phone";
    return fail(fields.terms ?? "validation", fields);
  }
  const v = parsed.data;
  if (v.password !== v.confirm) return fail("password_mismatch", { confirm: "password_mismatch" });
  const phone = normalizeTunisianPhone(v.phone);
  if (!phone) return fail("invalid_phone", { phone: "invalid_phone" });
  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeNext(String(fd.get("next") ?? ""));
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      data: { full_name: v.fullName, phone, locale: await getLocale() },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return fail(toErrorCode(error));
  // With email confirmation enabled, an existing address returns a user without identities.
  if (data.user && data.user.identities?.length === 0) return fail("email_taken", { email: "email_taken" });
  if (data.session) {
    revalidatePath("/", "layout");
    // New accounts must add an avatar (and confirm name/phone) before using the app.
    const after = safeNext(String(fd.get("next") ?? ""), "/");
    redirect(`/auth/complete-profile?next=${encodeURIComponent(after)}`);
  }
  redirect(`/auth/check-email?email=${encodeURIComponent(v.email)}`);
}

export async function forgotPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("forgot", 5);
  if (blocked) return blocked;
  const email = z.string().trim().toLowerCase().email().safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email");
  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });
  if (error && toErrorCode(error) === "rate_limited") return fail("rate_limited");
  // Always succeed to avoid revealing whether the email exists.
  return { ok: true };
}

export async function updatePasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const pw = passwordSchema.safeParse(fd.get("password"));
  if (!pw.success) return fail("weak_password", { password: "weak_password" });
  if (pw.data !== fd.get("confirm")) return fail("password_mismatch", { confirm: "password_mismatch" });
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return fail("not_authenticated");
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return fail(toErrorCode(error));
  if (fd.get("redirect") === "1") redirect("/dashboard?toast=password");
  return { ok: true };
}

export async function updateEmailAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = z.string().trim().toLowerCase().email().safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email");
  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.updateUser(
    { email: email.data },
    { emailRedirectTo: `${origin}/auth/callback?next=/dashboard/settings` },
  );
  if (error) return fail(toErrorCode(error));
  return { ok: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

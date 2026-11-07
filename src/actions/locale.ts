"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getUser();
  if (user) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ preferred_locale: locale }).eq("id", user.id);
  }
  revalidatePath("/", "layout");
}

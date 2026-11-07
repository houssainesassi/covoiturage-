import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, localeDir, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return defaultLocale;
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, d: getDictionary(locale), dir: localeDir(locale) };
}

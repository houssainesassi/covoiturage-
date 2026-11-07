import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, localeDir, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return defaultLocale;
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, d: getDictionary(locale), dir: localeDir(locale) };
}

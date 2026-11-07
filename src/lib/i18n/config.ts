export const locales = ["ar", "fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** BCP-47 tags used with Intl (Tunisian regional formats). */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-TN" : locale === "fr" ? "fr-TN" : "en-GB";
}

export const localeLabels: Record<Locale, string> = {
  fr: "Français",
  ar: "تونسي",
  en: "English",
};

import type { Locale } from "./i18n/config";

type Named = { name_fr: string; name_ar: string; name_en: string };

export function locName(loc: Named | null | undefined, locale: Locale): string {
  if (!loc) return "—";
  return locale === "ar" ? loc.name_ar : locale === "en" ? loc.name_en : loc.name_fr;
}

/** Notification payloads store place names as { fr, ar, en }. */
export function i18nName(v: unknown, locale: Locale): string {
  if (v && typeof v === "object" && locale in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)[locale]);
  }
  return "";
}

/** "Peugeot 301", or just "301" when the optional brand was left blank. */
export function vehicleName(v: { brand: string | null; model: string }) {
  return [v.brand, v.model].filter(Boolean).join(" ");
}

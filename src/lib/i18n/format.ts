import { intlLocale, type Locale } from "./config";

export const TUNIS_TZ = "Africa/Tunis";
/** Tunisia observes UTC+01:00 all year (no DST since 2009). */
export const TUNIS_OFFSET = "+01:00";

/** Replaces `{name}` placeholders. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type PluralForms = { one: string; other: string; zero?: string; two?: string; few?: string; many?: string };

/** Locale-aware plural selection (Arabic has six categories). `{count}` is interpolated. */
export function plural(forms: PluralForms, count: number, locale: Locale): string {
  const cat = new Intl.PluralRules(intlLocale(locale)).select(count) as keyof PluralForms;
  const template = forms[cat] ?? forms.other;
  return fmt(template, { count: formatNumber(count, locale) });
}

export function formatNumber(n: number, locale: Locale, maxFraction = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: maxFraction }).format(n);
}

const CURRENCY: Record<Locale, string> = { fr: "DT", ar: "د.ت", en: "TND" };

/** Tunisian dinar: up to 3 decimals (millimes), trailing zeros trimmed. */
export function formatPrice(amount: number | string, locale: Locale): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const num = new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(n);
  return `${num} ${CURRENCY[locale]}`;
}

function dtf(locale: Locale, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TUNIS_TZ, ...opts });
}

export function formatDate(iso: string | Date, locale: Locale, style: "long" | "short" | "full" = "long") {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (style === "full") return dtf(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  if (style === "short") return dtf(locale, { day: "numeric", month: "short" }).format(d);
  return dtf(locale, { weekday: "short", day: "numeric", month: "long" }).format(d);
}

export function formatTime(iso: string | Date, locale: Locale) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dtf(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function formatDateTime(iso: string | Date, locale: Locale) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dtf(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function formatMonth(yyyyMm: string, locale: Locale) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
}

export function formatRelative(iso: string | Date, locale: Locale) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDateTime(d, locale);
}

export function formatDuration(minutes: number, locale: Locale) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const hu = locale === "ar" ? "س" : "h";
  const mu = locale === "ar" ? "د" : "min";
  if (h === 0) return `${m} ${mu}`;
  return m === 0 ? `${h} ${hu}` : `${h} ${hu} ${String(m).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` of a moment as seen in Tunisia. */
export function tunisDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TUNIS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** `HH:mm` of a moment as seen in Tunisia. */
export function tunisTimeKey(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TUNIS_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** Builds an absolute timestamp from a Tunisian local date and time. */
export function tunisLocalToISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00${TUNIS_OFFSET}`).toISOString();
}

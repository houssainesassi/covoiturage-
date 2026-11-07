/**
 * Centralised environment access. Public values are inlined at build time by
 * Next.js (they must be referenced as literal `process.env.NEXT_PUBLIC_*`).
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, ""),
  homeCitySlug: process.env.NEXT_PUBLIC_HOME_CITY_SLUG || "el-fahs",
};

export function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabasePublishableKey);
}

import "server-only";

/** Server-only secrets. Never import this file from a Client Component. */
export const serverEnv = {
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
};

export function hasValidSecretKey() {
  const k = serverEnv.supabaseSecretKey;
  return Boolean(k) && !k.startsWith("YOUR_");
}

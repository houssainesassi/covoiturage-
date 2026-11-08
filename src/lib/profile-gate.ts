/**
 * Mandatory profile completion gate (name + avatar + phone).
 * The proxy redirects signed-in users with an incomplete profile to COMPLETE_PROFILE_PATH;
 * the database enforces the same rule on trips/bookings (see migration 8).
 */
export const COMPLETE_PROFILE_PATH = "/auth/complete-profile";

/** Caches "this user's profile is complete" (value = user id) to avoid a DB call on every request. */
export const PROFILE_OK_COOKIE = "wf_profile_ok";

/** Pages an incomplete profile may still open. */
const OPEN_PREFIXES = ["/auth", "/terms", "/privacy", "/help", "/api"];

export function isOpenPath(pathname: string) {
  return OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

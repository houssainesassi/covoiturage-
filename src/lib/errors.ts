import type { Dictionary } from "./i18n/dictionaries/en";

export type ErrorCode = keyof Dictionary["errors"];

const KNOWN = new Set<string>([
  "not_authenticated", "account_suspended", "invalid_seats", "message_too_long", "rate_limited",
  "trip_not_found", "cannot_book_own_trip", "trip_not_bookable", "duplicate_booking", "not_enough_seats",
  "booking_not_found", "forbidden", "booking_not_pending", "booking_not_active", "cancellation_window_closed",
  "trip_not_active", "trip_not_departed", "trip_not_editable", "departure_in_past", "departure_too_far",
  "invalid_vehicle", "seats_exceed_vehicle", "seats_below_booked", "route_locked", "invalid_photo_path",
  "invalid_vehicle_year", "invalid_rating", "trip_not_completed", "review_window_closed", "not_participant",
  "duplicate_review", "cannot_moderate_self", "user_not_found", "report_not_found", "review_not_found",
  "message_not_found", "profile_incomplete", "avatar_required", "phone_required",
]);

type AnyError = { message?: string; code?: string; status?: number } | null | undefined;

/** Maps Postgres / PostgREST / Supabase Auth errors to a translatable code. */
export function toErrorCode(error: AnyError): ErrorCode {
  if (!error) return "unknown";
  const msg = error.message ?? "";
  if (KNOWN.has(msg)) return msg as ErrorCode;
  switch (error.code) {
    case "invalid_credentials": return "invalid_credentials";
    case "email_not_confirmed": return "email_not_confirmed";
    case "user_already_exists":
    case "email_exists": return "email_taken";
    case "weak_password": return "weak_password";
    case "same_password": return "same_password";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit": return "rate_limited";
    case "23514": // check_violation
    case "23502":
    case "22P02":
    case "22001": return "validation";
    case "23505": return "duplicate_booking";
    case "42501": return "forbidden";
  }
  if (/invalid login credentials/i.test(msg)) return "invalid_credentials";
  if (/email not confirmed/i.test(msg)) return "email_not_confirmed";
  if (/already registered/i.test(msg)) return "email_taken";
  if (/error sending (confirmation|recovery|magic link)? ?email/i.test(msg)) return "email_send_failed";
  if (/row-level security|permission denied/i.test(msg)) return "forbidden";
  console.error("[unmapped error]", error);
  return "unknown";
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: ErrorCode; fields?: Record<string, ErrorCode> };

export const fail = (error: ErrorCode, fields?: Record<string, ErrorCode>): ActionResult<never> => ({ ok: false, error, fields });

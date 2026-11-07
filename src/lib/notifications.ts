import type { Dictionary } from "./i18n/dictionaries/en";
import type { Locale } from "./i18n/config";
import { fmt, formatDateTime, plural } from "./i18n/format";
import { i18nName } from "./names";
import type { Notification } from "./supabase/database.types";

type Data = Record<string, unknown>;

export function routeLabel(from: string, to: string, locale: Locale) {
  return `${from} ${locale === "ar" ? "←" : "→"} ${to}`;
}

export function describeNotification(n: Pick<Notification, "type" | "data">, d: Dictionary, locale: Locale) {
  const data = (n.data ?? {}) as Data;
  const route = routeLabel(i18nName(data.origin, locale), i18nName(data.destination, locale), locale);
  const vars = {
    name: String(data.actor_name ?? d.common.unknownUser),
    route,
    seats: typeof data.seats === "number" ? plural(d.units.seats, data.seats, locale) : "",
    rating: String(data.rating ?? ""),
    preview: String(data.preview ?? ""),
    date: data.departure_at ? formatDateTime(String(data.departure_at), locale) : "",
  };
  let key: keyof Dictionary["notifications"]["types"] = n.type === "account_status"
    ? data.status === "suspended" ? "account_suspended" : "account_active"
    : n.type;
  if (!(key in d.notifications.types)) key = "booking_cancelled";
  const tpl = d.notifications.types[key];
  const tripId = data.trip_id ? String(data.trip_id) : null;
  let href = "/dashboard/notifications";
  switch (n.type) {
    case "booking_request": href = tripId ? `/dashboard/trips/${tripId}` : href; break;
    case "booking_confirmed":
    case "booking_rejected": href = "/dashboard/bookings"; break;
    case "new_message": href = data.conversation_id ? `/dashboard/messages/${data.conversation_id}` : "/dashboard/messages"; break;
    case "trip_completed": href = "/dashboard/reviews"; break;
    case "review_received": href = "/dashboard/reviews?tab=received"; break;
    case "account_status": href = "/dashboard"; break;
    default: href = tripId ? `/trips/${tripId}` : href;
  }
  const byAdmin = data.by_admin === true ? ` (${d.notifications.byAdmin})` : "";
  return { title: fmt(tpl.title, vars), body: fmt(tpl.body, vars) + byAdmin, href };
}

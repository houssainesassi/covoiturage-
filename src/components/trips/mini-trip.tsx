import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import { formatDate, formatTime } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import type { Location } from "@/lib/supabase/database.types";

/** Compact trip row used in dashboards. */
export function MiniTrip({ href, departure, originId, destinationId, locations, locale, right, sub }: { href: string; departure: string; originId: string; destinationId: string; locations: Map<string, Location>; locale: Locale; right?: ReactNode; sub?: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)] transition hover:border-brand-300">
      <div className="w-16 shrink-0 rounded-xl bg-brand-50 py-2 text-center">
        <p className="text-xs font-semibold uppercase text-brand-700">{formatDate(departure, locale, "short")}</p>
        <p className="text-sm font-bold tabular-nums text-slate-900">{formatTime(departure, locale)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{routeLabel(locName(locations.get(originId), locale), locName(locations.get(destinationId), locale), locale)}</p>
        {sub && <div className="mt-0.5 text-sm text-slate-500">{sub}</div>}
      </div>
      {right}
    </Link>
  );
}

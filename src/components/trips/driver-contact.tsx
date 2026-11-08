import Link from "next/link";
import { Lock, Phone, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ContactButton } from "@/components/trips/contact-button";
import { buttonClass } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { fmt, plural } from "@/lib/i18n/format";
import { formatTunisianPhone } from "@/lib/phone";

type Props = {
  d: Dictionary;
  locale: Locale;
  tripId: string;
  driver: { id: string; full_name: string; avatar_path: string | null; rating_avg: number; rating_count: number };
  phone: string | null;
  plate?: string | null;
  /** Viewer's relation to the ride. */
  viewer: "guest" | "owner" | "member";
  /** The ride can still be booked or discussed. */
  active: boolean;
};

/** Who is driving and how to reach them, placed right next to the booking action. */
export function DriverContact({ d, locale, tripId, driver, phone, plate, viewer, active }: Props) {
  const loginHref = `/auth/login?next=${encodeURIComponent(`/trips/${tripId}`)}`;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <Avatar path={driver.avatar_path} name={driver.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-500">{d.trip.driver}</p>
          <Link href={`/users/${driver.id}`} className="block truncate text-lg font-bold hover:text-brand-700">{driver.full_name || d.common.unknownUser}</Link>
          <p className="flex items-center gap-1 text-sm text-slate-500">
            {driver.rating_count > 0
              ? <><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />{fmt(d.trip.ratingLine, { rating: Number(driver.rating_avg).toFixed(1), count: plural(d.units.reviews, driver.rating_count, locale) })}</>
              : d.trip.newMember}
          </p>
        </div>
      </div>

      {phone ? (
        viewer === "owner" ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">{d.trip.yourNumberShown}</p>
            <p className="mt-0.5 text-lg font-bold" dir="ltr">{formatTunisianPhone(phone)}</p>
          </div>
        ) : (
          <a href={`tel:${phone}`} className="group mt-4 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 transition hover:border-brand-300 hover:bg-brand-100 active:scale-[0.99]">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"><Phone className="size-5" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-brand-800">{d.trip.callDriver}</span>
              <span className="block text-lg font-extrabold tabular-nums text-slate-900" dir="ltr">{formatTunisianPhone(phone)}</span>
            </span>
          </a>
        )
      ) : active && viewer === "guest" ? (
        <Link href={loginHref} className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800 transition hover:border-brand-300 hover:bg-brand-50">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 ring-1 ring-slate-200"><Lock className="size-5" aria-hidden /></span>
          {d.trip.loginToSeePhone}
        </Link>
      ) : active && viewer === "member" ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">{d.trip.noDriverPhone}</p>
      ) : null}

      {plate && <p className="mt-3 flex justify-between gap-3 text-sm"><span className="text-slate-500">{d.trip.plate}</span><span className="font-semibold">{plate}</span></p>}

      {active && viewer !== "owner" && (
        <div className="mt-3">
          {viewer === "member"
            ? <ContactButton tripId={tripId} label={d.trip.contactDriver} className="w-full" />
            : <Link href={loginHref} className={buttonClass("outline", "md", "w-full")}>{d.trip.contactDriver}</Link>}
        </div>
      )}
    </Card>
  );
}

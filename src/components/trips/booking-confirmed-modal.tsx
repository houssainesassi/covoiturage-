"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatTunisianPhone } from "@/lib/phone";
import { buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/client";
import { ContactButton } from "@/components/trips/contact-button";

/** Remembered per device so the popup appears once per confirmed booking, not on every visit. */
const seenKey = (bookingId: string) => `wasalni.bookingConfirmedSeen.${bookingId}`;

function alreadySeen(bookingId: string) {
  try {
    return localStorage.getItem(seenKey(bookingId)) === "1";
  } catch {
    return false;
  }
}

/** Shown in this page session: stays open even after it was marked as seen. */
const shownNow = new Set<string>();
const noSubscribe = () => () => {};

function markSeen(bookingId: string) {
  try {
    localStorage.setItem(seenKey(bookingId), "1");
  } catch {}
}

/**
 * Shown the first time the passenger sees their booking confirmed: right after booking a ride that
 * accepts automatically, or on their next visit once the driver has accepted the request.
 * Offers a call (the number is only available to confirmed passengers) or the in-app conversation.
 */
export function BookingConfirmedModal({ bookingId, tripId, driverPhone }: { bookingId: string; tripId: string; driverPhone: string | null }) {
  const { d } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  // Read on the device only; the server render never shows it.
  const firstTime = useSyncExternalStore(noSubscribe, () => shownNow.has(bookingId) || !alreadySeen(bookingId), () => false);
  const open = firstTime && !dismissed;

  useEffect(() => {
    if (!open) return;
    shownNow.add(bookingId);
    markSeen(bookingId);
  }, [open, bookingId]);
  const setOpen = (v: boolean) => {
    if (!v) shownNow.delete(bookingId); // closed: not again on a later visit in this session
    setDismissed(!v);
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title={d.trip.bookingConfirmedTitle}>
      <div data-testid="booking-confirmed-modal">
        <p className="text-base text-slate-700">{d.trip.bookingConfirmedQuestion}</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {driverPhone ? (
            <a href={`tel:${driverPhone}`} onClick={() => setOpen(false)} data-testid="booking-confirmed-call" className={buttonClass("primary", "lg", "w-full flex-col gap-0.5")}>
              <span>{d.trip.bookingConfirmedCall}</span>
              <span className="text-sm font-semibold tabular-nums opacity-90" dir="ltr">{formatTunisianPhone(driverPhone)}</span>
            </a>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span aria-disabled="true" className={buttonClass("primary", "lg", "w-full pointer-events-none opacity-50")}>{d.trip.bookingConfirmedCall}</span>
              <p className="text-xs text-slate-500">{d.trip.noDriverPhone}</p>
            </div>
          )}
          {/* Opens the conversation (the page navigates away): don't show this again on return. */}
          <div onClickCapture={() => shownNow.delete(bookingId)}>
            <ContactButton tripId={tripId} label={d.trip.bookingConfirmedInApp} variant="outline" size="lg" icon={false} className="w-full" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

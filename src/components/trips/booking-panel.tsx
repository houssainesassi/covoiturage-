"use client";
import { useFormAction } from "@/lib/use-form-action";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Minus, PartyPopper, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestBookingAction } from "@/actions/bookings";
import { cancelBookingAction } from "@/actions/bookings";
import { useI18n } from "@/lib/i18n/client";
import { formatPrice } from "@/lib/i18n/format";
import { BookingStatusNotice } from "@/components/trips/booking-status";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, FormError, Label, Textarea } from "@/components/ui/form";
import { ConfirmAction, SubmitButton } from "@/components/ui/client";
import type { BookingStatus } from "@/lib/supabase/database.types";

type Props = {
  tripId: string;
  price: number;
  seatsAvailable: number;
  state: "guest" | "own" | "bookable" | "full" | "departed" | "cancelled" | "completed";
  booking: { id: string; status: BookingStatus; seats: number; total: number } | null;
  initialSeats?: number;
  /** The passenger's latest request for this ride was declined. */
  wasRejected?: boolean;
};

export function BookingPanel({ tripId, price, seatsAvailable, state, booking, initialSeats = 1, wasRejected = false }: Props) {
  const { d, locale } = useI18n();
  const router = useRouter();
  const [seats, setSeats] = useState(Math.min(Math.max(initialSeats, 1), Math.max(seatsAvailable, 1)));
  const [result, action, pending] = useFormAction(requestBookingAction);
  useEffect(() => {
    if (result?.ok) {
      toast.success(d.trip.bookingRequested);
      router.refresh();
    }
  }, [result, d, router]);

  if (booking) {
    return (
      <div className="space-y-3">
        {result?.ok && (
          <div role="status" className="animate-pop-in rounded-2xl bg-brand-600 p-4 text-white">
            <p className="flex items-center gap-2 text-lg font-bold"><PartyPopper className="size-5 shrink-0" aria-hidden />{d.trip.bookingSentTitle}</p>
            <p className="mt-1 text-sm text-white/90">{d.trip.bookingSentBody}</p>
          </div>
        )}
        <BookingStatusNotice status={booking.status} d={d} />
        <p className="flex items-center justify-between gap-3 rounded-xl bg-sand-100 px-4 py-3 text-sm text-slate-600">
          <span>{d.bookings.seatsBooked}: <strong className="text-slate-900">{booking.seats}</strong></span>
          <span>{d.common.total}: <strong className="text-slate-900">{formatPrice(booking.total, locale)}</strong></span>
        </p>
        {(booking.status === "pending" || booking.status === "confirmed") && state !== "departed" && (
          <ConfirmAction
            action={cancelBookingAction.bind(null, booking.id)}
            label={d.trip.cancelBooking}
            title={d.bookings.cancelTitle}
            body={d.bookings.cancelBody}
            confirmLabel={d.bookings.confirmCancel}
            successMessage={d.bookings.cancelled}
            withReason
            className="w-full"
            size="md"
          />
        )}
        <Link href="/dashboard/bookings" className={buttonClass("outline", "md", "w-full")}>{d.nav.myBookings}</Link>
      </div>
    );
  }

  if (state === "own") return <Link href={`/dashboard/trips/${tripId}`} className={buttonClass("primary", "lg", "w-full")}>{d.trip.manageTrip}</Link>;
  if (state !== "bookable" && state !== "guest") {
    const msg = { full: d.trip.full, departed: d.trip.departed, cancelled: d.trip.cancelled, completed: d.trip.completed }[state];
    return <p className="rounded-xl bg-slate-100 p-4 text-center font-medium text-slate-600">{msg}</p>;
  }

  const maxSeats = Math.max(Math.min(seatsAvailable, 8), 1);
  const seatPicker = (
    <div>
      <Label>{d.trip.seatsToBook}</Label>
      <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white p-1.5">
        <Button type="button" variant="secondary" size="icon" onClick={() => setSeats((n) => Math.max(n - 1, 1))} disabled={seats <= 1} aria-label={d.trip.removeSeat}><Minus className="size-5" aria-hidden /></Button>
        <output className="text-2xl font-extrabold tabular-nums" aria-live="polite">{seats}</output>
        <Button type="button" variant="secondary" size="icon" onClick={() => setSeats((n) => Math.min(n + 1, maxSeats))} disabled={seats >= maxSeats} aria-label={d.trip.addSeat}><Plus className="size-5" aria-hidden /></Button>
      </div>
      <input type="hidden" name="seats" value={seats} />
    </div>
  );
  const total = (
    <div className="flex items-center justify-between rounded-xl bg-sand-100 px-4 py-3">
      <span className="text-sm text-slate-600">{d.trip.totalPrice}</span>
      <span className="text-lg font-extrabold">{formatPrice(price * seats, locale)}</span>
    </div>
  );

  if (state === "guest") {
    return (
      <div className="space-y-4">
        {seatPicker}
        {total}
        <p className="text-sm text-slate-500">{d.auth.loginToBook}</p>
        <Link href={`/auth/login?next=${encodeURIComponent(`/trips/${tripId}?seats=${seats}`)}`} className={buttonClass("primary", "lg", "w-full")}>{d.trip.loginToBook}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={action} className="space-y-4">
      {wasRejected && (
        <div className="space-y-2">
          <BookingStatusNotice status="rejected" d={d} />
          <Link href="/search" className={buttonClass("outline", "md", "w-full")}><Search className="size-4" aria-hidden />{d.trip.findOtherRide}</Link>
        </div>
      )}
      <input type="hidden" name="tripId" value={tripId} />
      {seatPicker}
      {total}
      {result && !result.ok && <FormError message={d.errors[result.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.trip.bookRequest}</SubmitButton>
      <p className="text-center text-xs text-slate-500">{d.trip.approvalHint} {d.trip.paymentNote}</p>
      <details className="group">
        <summary className="cursor-pointer text-center text-sm font-semibold text-brand-700">{d.trip.addMessage}</summary>
        <Field label={d.trip.messageToDriver} htmlFor="book-message" optional={d.common.optional} className="mt-3">
          <Textarea id="book-message" name="message" maxLength={500} placeholder={d.trip.messagePlaceholder} />
        </Field>
      </details>
    </form>
  );
}

"use client";
import { useFormAction } from "@/lib/use-form-action";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestBookingAction } from "@/actions/bookings";
import { cancelBookingAction } from "@/actions/bookings";
import { useI18n } from "@/lib/i18n/client";
import { formatPrice } from "@/lib/i18n/format";
import { Badge, bookingTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { ConfirmAction, SubmitButton } from "@/components/ui/client";
import type { BookingStatus } from "@/lib/supabase/database.types";

type Props = {
  tripId: string;
  price: number;
  seatsAvailable: number;
  state: "guest" | "own" | "bookable" | "full" | "departed" | "cancelled" | "completed";
  booking: { id: string; status: BookingStatus; seats: number; total: number } | null;
  initialSeats?: number;
};

export function BookingPanel({ tripId, price, seatsAvailable, state, booking, initialSeats = 1 }: Props) {
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
        <div className="flex items-center justify-between">
          <span className="font-semibold">{d.trip.yourBooking}</span>
          <Badge tone={bookingTone[booking.status]}>{d.status.booking[booking.status]}</Badge>
        </div>
        <p className="text-sm text-slate-600">{d.bookings.seatsBooked}: <strong>{booking.seats}</strong> · {d.common.total}: <strong>{formatPrice(booking.total, locale)}</strong></p>
        {booking.status === "pending" && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{d.bookings.pendingHint}</p>}
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
        <Link href="/dashboard/bookings" className={buttonClass("ghost", "sm", "w-full")}>{d.nav.myBookings}</Link>
      </div>
    );
  }

  if (state === "own") return <Link href={`/dashboard/trips/${tripId}`} className={buttonClass("primary", "lg", "w-full")}>{d.trip.manageTrip}</Link>;
  if (state !== "bookable" && state !== "guest") {
    const msg = { full: d.trip.full, departed: d.trip.departed, cancelled: d.trip.cancelled, completed: d.trip.completed }[state];
    return <p className="rounded-xl bg-slate-100 p-4 text-center font-medium text-slate-600">{msg}</p>;
  }

  const seatOptions = Array.from({ length: Math.min(seatsAvailable, 8) }, (_, i) => i + 1);
  const seatSelect = (
    <Field label={d.trip.seatsToBook} htmlFor="book-seats">
      <Select id="book-seats" name="seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
        {seatOptions.map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
    </Field>
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
        {seatSelect}
        {total}
        <p className="text-sm text-slate-500">{d.auth.loginToBook}</p>
        <Link href={`/auth/login?next=${encodeURIComponent(`/trips/${tripId}?seats=${seats}`)}`} className={buttonClass("primary", "lg", "w-full")}>{d.trip.loginToBook}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={action} className="space-y-4">
      <input type="hidden" name="tripId" value={tripId} />
      {seatSelect}
      <Field label={d.trip.messageToDriver} htmlFor="book-message" optional={d.common.optional}>
        <Textarea id="book-message" name="message" maxLength={500} placeholder={d.trip.messagePlaceholder} />
      </Field>
      {total}
      {result && !result.ok && <FormError message={d.errors[result.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.trip.bookRequest}</SubmitButton>
      <p className="text-center text-xs text-slate-500">{d.trip.approvalHint} {d.trip.paymentNote}</p>
    </form>
  );
}

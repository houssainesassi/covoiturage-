"use client";
import { useFormAction } from "@/lib/use-form-action";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { submitReviewAction } from "@/actions/reviews";
import { useI18n } from "@/lib/i18n/client";
import { FormError, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";
import { cn } from "@/lib/utils";

export function ReviewForm({ tripId, revieweeId }: { tripId: string; revieweeId: string }) {
  const { d } = useI18n();
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, action, pending] = useFormAction(submitReviewAction);
  useEffect(() => {
    if (state?.ok) {
      toast.success(d.reviews.thanks);
      router.refresh();
    }
  }, [state, d, router]);
  const shown = hover || rating;
  return (
    <form onSubmit={action} className="space-y-3">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="revieweeId" value={revieweeId} />
      <input type="hidden" name="rating" value={rating || ""} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">{d.reviews.rating}</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} aria-label={d.reviews.stars[n - 1]} aria-pressed={rating === n} className="rounded p-0.5">
              <Star className={cn("size-7 transition", n <= shown ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
            </button>
          ))}
          {shown > 0 && <span className="ms-2 text-sm font-medium text-slate-600">{d.reviews.stars[shown - 1]}</span>}
        </div>
      </fieldset>
      <Textarea name="comment" maxLength={1000} placeholder={d.reviews.commentPlaceholder} aria-label={d.reviews.comment} />
      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} size="sm">{d.reviews.submit}</SubmitButton>
    </form>
  );
}

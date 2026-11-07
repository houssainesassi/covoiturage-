import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Stars } from "@/components/ui/misc";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";

export type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewee_role: string;
  is_hidden: boolean;
  person: { id: string; full_name: string; avatar_path: string | null } | null;
};

export function ReviewList({ reviews, d, locale, empty }: { reviews: ReviewItem[]; d: Dictionary; locale: Locale; empty: string }) {
  if (!reviews.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {reviews.map((r) => (
        <li key={r.id} className="flex gap-3 py-4">
          <Avatar path={r.person?.avatar_path} name={r.person?.full_name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              {r.person ? <Link href={`/users/${r.person.id}`} className="text-sm font-semibold hover:text-brand-700">{r.person.full_name}</Link> : null}
              <Stars value={r.rating} />
              <span className="text-xs text-slate-400">{formatDate(r.created_at, locale, "short")} · {r.reviewee_role === "driver" ? d.reviews.asDriver : d.reviews.asPassenger}</span>
            </div>
            {r.is_hidden ? <p className="mt-1 text-sm italic text-slate-400">{d.reviews.hidden}</p> : r.comment && <p className="mt-1 text-sm text-slate-700">{r.comment}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

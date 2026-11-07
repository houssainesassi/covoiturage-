import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDateTime } from "@/lib/i18n/format";
import { PageHeader } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Pagination, Stars } from "@/components/ui/misc";
import { Table } from "@/components/admin/table";
import { HideButton } from "@/components/admin/admin-actions";

const PAGE = 25;

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("reviews")
    .select("id, rating, comment, is_hidden, is_demo, created_at, reviewer:profiles!reviews_reviewer_id_fkey(id, full_name), reviewee:profiles!reviews_reviewee_id_fkey(id, full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  const totalPages = Math.ceil((count ?? 0) / PAGE);
  return (
    <div>
      <PageHeader title={d.admin.reviews} />
      <Table head={[d.reviews.rating, d.reviews.comment, d.admin.reviewer, d.admin.reviewee, d.common.date, d.common.actions]} empty={!data?.length && <p className="p-6 text-center text-sm text-slate-500">{d.admin.empty}</p>}>
        {(data ?? []).map((r) => (
          <tr key={r.id} className={r.is_hidden ? "bg-slate-50 text-slate-400" : ""}>
            <td className="px-4 py-3"><Stars value={r.rating} /></td>
            <td className="max-w-xs px-4 py-3">{r.comment ?? "—"} {r.is_hidden && <Badge tone="neutral">{d.reviews.hidden}</Badge>} {r.is_demo && <DemoBadge label={d.common.demo} />}</td>
            <td className="px-4 py-3">{r.reviewer && <Link href={`/users/${r.reviewer.id}`} className="hover:text-brand-700">{r.reviewer.full_name}</Link>}</td>
            <td className="px-4 py-3">{r.reviewee && <Link href={`/users/${r.reviewee.id}`} className="hover:text-brand-700">{r.reviewee.full_name}</Link>}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(r.created_at, locale)}</td>
            <td className="px-4 py-3"><HideButton kind="review" id={r.id} hidden={r.is_hidden} /></td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/reviews?page=${p}`} labels={{ previous: d.common.previous, next: d.common.next, pageOf: fmt(d.common.pageOf, { page, total: totalPages }) }} />
    </div>
  );
}

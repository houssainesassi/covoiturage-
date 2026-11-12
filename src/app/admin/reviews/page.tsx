import { requireAdmin } from "@/lib/auth";
import { Star } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { contains, oneOf, pageParam, rangeOf, rowsOf, textParam } from "@/lib/admin";
import { PageHeader } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Stars } from "@/components/ui/misc";
import { DataTable, FilterBar, ListEmpty, listHref, Person, RowActions, SearchField, TablePager, Td } from "@/components/admin/table";
import { FilterSelect } from "@/components/admin/filter-select";
import { HideButton } from "@/components/admin/admin-actions";

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireAdmin(); // pages render in parallel with the layout guard
  const sp = await searchParams;
  const q = textParam(sp.q);
  const visibility = oneOf(sp.visibility, ["visible", "hidden"] as const);
  const rating = oneOf(sp.rating, ["1", "2", "3", "4", "5"] as const);
  const data = oneOf(sp.data, ["real", "demo"] as const);
  const page = pageParam(sp.page);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  let query = supabase.from("reviews").select("id, rating, comment, is_hidden, is_demo, created_at, reviewer:profiles!reviews_reviewer_id_fkey(id, full_name, avatar_path), reviewee:profiles!reviews_reviewee_id_fkey(id, full_name, avatar_path)", { count: "exact" });
  if (q) query = query.ilike("comment", contains(q));
  if (visibility) query = query.eq("is_hidden", visibility === "hidden");
  if (rating) query = query.eq("rating", Number(rating));
  if (data) query = query.eq("is_demo", data === "demo");
  const { rows, total } = rowsOf(await query.order("created_at", { ascending: false }).range(...rangeOf(page)));
  const filtered = Boolean(q || visibility || rating || data);
  const c = { comment: d.reviews.comment, rating: d.reviews.rating, reviewer: d.admin.reviewer, reviewee: d.admin.reviewee, date: d.common.date };
  return (
    <div>
      <PageHeader title={d.admin.reviews} description={d.admin.reviewsSubtitle} />
      <FilterBar action="/admin/reviews" active={filtered}>
        <SearchField value={q} placeholder={d.admin.searchReviews} />
        <FilterSelect name="visibility" defaultValue={visibility ?? ""} aria-label={d.admin.allReviews}>
          <option value="">{d.admin.allReviews}</option>
          <option value="visible">{d.admin.visibleOnly}</option>
          <option value="hidden">{d.admin.hiddenOnly}</option>
        </FilterSelect>
        <FilterSelect name="rating" defaultValue={rating ?? ""} aria-label={d.reviews.rating}>
          <option value="">{d.admin.allRatings}</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
        </FilterSelect>
        <FilterSelect name="data" defaultValue={data ?? ""} aria-label={d.admin.allData}>
          <option value="">{d.admin.allData}</option>
          <option value="real">{d.admin.realOnly}</option>
          <option value="demo">{d.admin.demoOnly}</option>
        </FilterSelect>
      </FilterBar>
      {!rows.length ? <ListEmpty filtered={filtered || page > 1} clearHref="/admin/reviews" icon={<Star className="size-6" aria-hidden />} /> : (
        <DataTable head={[c.comment, c.rating, c.reviewer, c.reviewee, c.date, d.common.actions]}>
          {rows.map((r) => (
            <tr key={r.id} className={r.is_hidden ? "bg-slate-50 text-slate-500" : ""}>
              <Td primary className="max-w-sm">
                <p dir="auto" className="text-start wrap-anywhere">{r.comment ?? "—"}</p>
                {(r.is_hidden || r.is_demo) && <div className="mt-1 flex flex-wrap gap-1">{r.is_hidden && <Badge tone="neutral">{d.reviews.hidden}</Badge>}{r.is_demo && <DemoBadge label={d.common.demo} />}</div>}
              </Td>
              <Td label={c.rating}><Stars value={r.rating} /></Td>
              <Td label={c.reviewer}>{r.reviewer && <Person id={r.reviewer.id} name={r.reviewer.full_name} avatar={r.reviewer.avatar_path} />}</Td>
              <Td label={c.reviewee}>{r.reviewee && <Person id={r.reviewee.id} name={r.reviewee.full_name} avatar={r.reviewee.avatar_path} />}</Td>
              <Td label={c.date} className="text-xs text-slate-500">{formatDateTime(r.created_at, locale)}</Td>
              <Td actions><RowActions><HideButton kind="review" id={r.id} hidden={r.is_hidden} /></RowActions></Td>
            </tr>
          ))}
        </DataTable>
      )}
      <TablePager page={page} total={total} hrefFor={(p) => listHref("/admin/reviews", { q, visibility, rating, data, page: p })} />
    </div>
  );
}

import Link from "next/link";
import { CheckCircle2, Flag } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import type { ReportReason, ReportStatus } from "@/lib/supabase/database.types";
import { oneOf, pageParam, rangeOf, rowsOf } from "@/lib/admin";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/misc";
import { FilterBar, ListEmpty, listHref, Person, RowActions, TablePager, ViewLink } from "@/components/admin/table";
import { FilterSelect } from "@/components/admin/filter-select";
import { HideButton, ReportControls, UserActions } from "@/components/admin/admin-actions";

const PAGE = 20;
const STATUSES: readonly ReportStatus[] = ["open", "in_review", "resolved", "dismissed"];
const REASONS: readonly ReportReason[] = ["inappropriate_behavior", "harassment", "fraud", "no_show", "dangerous_driving", "fake_profile", "spam", "other"];
const statusTone: Record<ReportStatus, Tone> = { open: "danger", in_review: "warning", resolved: "success", dismissed: "neutral" };

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin(); // pages render in parallel with the layout guard
  const sp = await searchParams;
  const status = oneOf(sp.status, STATUSES) ?? "open";
  const reason = oneOf(sp.reason, REASONS);
  const page = pageParam(sp.page);
  const { d, locale } = await getI18n();
  const me = await getUser();
  const supabase = await createClient();
  let query = supabase
    .from("reports")
    .select("*, reporter:profiles!reports_reporter_id_fkey(id, full_name, avatar_path), reported:profiles!reports_reported_user_id_fkey(id, full_name, avatar_path, status, role), review:reviews!reports_review_id_fkey(id, rating, comment, is_hidden)", { count: "exact" })
    .eq("status", status);
  if (reason) query = query.eq("reason", reason);
  const [list, open, inReview] = await Promise.all([
    query.order("created_at", { ascending: false }).range(...rangeOf(page, PAGE)),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "in_review"),
  ]);
  const { rows: reports, total } = rowsOf(list);
  const counts: Partial<Record<ReportStatus, number>> = { open: open.count ?? 0, in_review: inReview.count ?? 0 };
  // Messages are private; admins read them through a dedicated audited function.
  const messages = new Map<string, { body: string; is_hidden: boolean; sender_name: string }>();
  await Promise.all(reports.filter((r) => r.message_id).map(async (r) => {
    const { data: m } = await supabase.rpc("admin_get_message", { p_message_id: r.message_id! });
    if (m?.[0]) messages.set(r.message_id!, m[0]);
  }));
  const evidence = "rounded-xl border border-slate-200 p-3";
  return (
    <div>
      <PageHeader title={d.admin.reports} description={d.admin.reportsSubtitle} />
      <Tabs active={status} tabs={STATUSES.map((s) => ({ key: s, label: d.admin.reportStatuses[s], count: counts[s], href: listHref("/admin/reports", { status: s, reason }) }))} />
      <FilterBar action="/admin/reports" active={Boolean(reason)} clearHref={listHref("/admin/reports", { status })}>
        <input type="hidden" name="status" value={status} />
        <FilterSelect name="reason" defaultValue={reason ?? ""} aria-label={d.admin.allReasons}>
          <option value="">{d.admin.allReasons}</option>
          {REASONS.map((r) => <option key={r} value={r}>{d.report.reasons[r]}</option>)}
        </FilterSelect>
      </FilterBar>
      {!reports.length ? <ListEmpty filtered={Boolean(reason) || page > 1} clearHref={listHref("/admin/reports", { status })} icon={status === "open" ? <CheckCircle2 className="size-6" aria-hidden /> : <Flag className="size-6" aria-hidden />} /> : (
        <div className="space-y-4">
          {reports.map((r) => {
            const msg = r.message_id ? messages.get(r.message_id) : null;
            return (
              <Card key={r.id} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0 space-y-3 p-4 text-sm sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone[r.status]}>{d.admin.reportStatuses[r.status]}</Badge>
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-900"><Flag className="size-3.5 text-slate-400" aria-hidden />{d.report.reasons[r.reason]}</span>
                    <span className="ms-auto text-xs text-slate-500">{formatDateTime(r.created_at, locale)}</span>
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="mb-1 text-xs font-semibold text-slate-500">{d.admin.reported}</dt>
                      <dd className="flex flex-wrap items-center gap-2">
                        {r.reported && <Person id={r.reported.id} name={r.reported.full_name} avatar={r.reported.avatar_path} />}
                        {r.reported?.status === "suspended" && <Badge tone="danger">{d.admin.suspended}</Badge>}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-xs font-semibold text-slate-500">{d.admin.reporter}</dt>
                      <dd>{r.reporter && <Person id={r.reporter.id} name={r.reporter.full_name} avatar={r.reporter.avatar_path} />}</dd>
                    </div>
                  </dl>
                  {r.details && <p dir="auto" className="rounded-xl bg-slate-50 p-3 text-start text-slate-700 wrap-anywhere">{r.details}</p>}
                  {r.trip_id && <p><Link href={`/trips/${r.trip_id}`} className="font-semibold text-brand-700 hover:underline">{d.admin.reportedTrip}</Link></p>}
                  {msg && (
                    <div className={evidence}>
                      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">{d.admin.reportedMessage} · <bdi>{msg.sender_name}</bdi>{msg.is_hidden && <Badge tone="neutral">{d.reviews.hidden}</Badge>}</p>
                      <p dir="auto" className="mt-1 text-start wrap-anywhere">{msg.body}</p>
                      <div className="mt-2"><HideButton kind="message" id={r.message_id!} hidden={msg.is_hidden} /></div>
                    </div>
                  )}
                  {r.review && (
                    <div className={evidence}>
                      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">{d.admin.reportedReview} · ★ {r.review.rating}{r.review.is_hidden && <Badge tone="neutral">{d.reviews.hidden}</Badge>}</p>
                      <p dir="auto" className="mt-1 text-start wrap-anywhere">{r.review.comment}</p>
                      <div className="mt-2"><HideButton kind="review" id={r.review.id} hidden={r.review.is_hidden} /></div>
                    </div>
                  )}
                </div>
                <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5 lg:rounded-e-[var(--radius-card)] lg:border-s lg:border-t-0">
                  <ReportControls id={r.id} status={r.status} note={r.admin_note} />
                  {r.reported && (
                    <div className="border-t border-slate-200 pt-3">
                      <p className="mb-2 text-xs font-semibold text-slate-500">{d.admin.reported}</p>
                      <RowActions>
                        <ViewLink href={`/users/${r.reported.id}`} label={d.admin.viewProfile} />
                        <UserActions id={r.reported.id} name={r.reported.full_name} status={r.reported.status} role={r.reported.role} self={r.reported.id === me?.id} />
                      </RowActions>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <TablePager page={page} total={total} size={PAGE} hrefFor={(p) => listHref("/admin/reports", { status, reason, page: p })} />
    </div>
  );
}

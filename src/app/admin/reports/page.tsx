import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDateTime } from "@/lib/i18n/format";
import type { ReportStatus } from "@/lib/supabase/database.types";
import { PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Pagination, Tabs } from "@/components/ui/misc";
import { HideButton, ReportControls, UserActions } from "@/components/admin/admin-actions";
import { Flag } from "lucide-react";

const PAGE = 20;

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const all: ReportStatus[] = ["open", "in_review", "resolved", "dismissed"];
  const status = all.includes(sp.status as ReportStatus) ? (sp.status as ReportStatus) : "open";
  const page = Math.max(Number(sp.page) || 1, 1);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("reports")
    .select("*, reporter:profiles!reports_reporter_id_fkey(id, full_name), reported:profiles!reports_reported_user_id_fkey(id, full_name, status, role), review:reviews!reports_review_id_fkey(id, rating, comment, is_hidden)", { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  const reports = data ?? [];
  // Messages are private; admins read them through a dedicated audited function.
  const messages = new Map<string, { body: string; is_hidden: boolean; sender_name: string }>();
  await Promise.all(reports.filter((r) => r.message_id).map(async (r) => {
    const { data: m } = await supabase.rpc("admin_get_message", { p_message_id: r.message_id! });
    if (m?.[0]) messages.set(r.message_id!, m[0]);
  }));
  const totalPages = Math.ceil((count ?? 0) / PAGE);
  return (
    <div>
      <PageHeader title={d.admin.reports} />
      <Tabs active={status} tabs={all.map((s) => ({ key: s, label: d.admin.reportStatuses[s], href: `/admin/reports?status=${s}` }))} />
      {!reports.length ? <EmptyState icon={<Flag className="size-6" />} title={d.admin.empty} /> : (
        <div className="space-y-4">
          {reports.map((r) => {
            const msg = r.message_id ? messages.get(r.message_id) : null;
            return (
              <Card key={r.id} className="grid gap-4 p-5 md:grid-cols-[1fr_18rem]">
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{d.report.reasons[r.reason]}</Badge>
                    <span className="text-slate-400">{formatDateTime(r.created_at, locale)}</span>
                  </div>
                  <p><span className="text-slate-500">{d.admin.reported}:</span> {r.reported && <Link href={`/users/${r.reported.id}`} className="font-semibold hover:text-brand-700">{r.reported.full_name}</Link>} {r.reported?.status === "suspended" && <Badge tone="neutral">{d.admin.suspended}</Badge>}</p>
                  <p><span className="text-slate-500">{d.admin.reporter}:</span> {r.reporter && <Link href={`/users/${r.reporter.id}`} className="hover:text-brand-700">{r.reporter.full_name}</Link>}</p>
                  {r.details && <p className="rounded-xl bg-slate-50 p-3 text-slate-700">{r.details}</p>}
                  {r.trip_id && <p><Link href={`/trips/${r.trip_id}`} className="font-medium text-brand-700 hover:underline">{d.admin.reportedTrip}</Link></p>}
                  {msg && (
                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500">{d.admin.reportedMessage} · {msg.sender_name}</p>
                      <p className="mt-1">{msg.body}</p>
                      <div className="mt-2"><HideButton kind="message" id={r.message_id!} hidden={msg.is_hidden} /></div>
                    </div>
                  )}
                  {r.review && (
                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500">{d.admin.reportedReview} · ★ {r.review.rating}</p>
                      <p className="mt-1">{r.review.comment}</p>
                      <div className="mt-2"><HideButton kind="review" id={r.review.id} hidden={r.review.is_hidden} /></div>
                    </div>
                  )}
                </div>
                <div className="space-y-3 border-t border-slate-100 pt-4 md:border-s md:border-t-0 md:ps-4 md:pt-0">
                  <ReportControls id={r.id} status={r.status} note={r.admin_note} />
                  {r.reported && <UserActions id={r.reported.id} name={r.reported.full_name} status={r.reported.status} role={r.reported.role} self={false} />}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/reports?status=${status}&page=${p}`} labels={{ previous: d.common.previous, next: d.common.next, pageOf: fmt(d.common.pageOf, { page, total: totalPages }) }} />
    </div>
  );
}

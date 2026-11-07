import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatRelative } from "@/lib/i18n/format";
import { describeNotification } from "@/lib/notifications";
import { markAllNotificationsReadAction } from "@/actions/notifications";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { ConfirmAction } from "@/components/ui/client";
import { cn } from "@/lib/utils";

const PAGE = 20;

export default async function NotificationsPage({ searchParams }: PageProps<"/dashboard/notifications">) {
  const user = await requireUser("/dashboard/notifications");
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data, count } = await supabase.from("notifications").select("*", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const items = data ?? [];
  const totalPages = Math.ceil((count ?? 0) / PAGE);
  const hasUnread = items.some((n) => !n.read_at);
  return (
    <div>
      <PageHeader title={d.notifications.title} action={hasUnread ? <ConfirmAction action={markAllNotificationsReadAction} label={d.notifications.markAllRead} skipConfirm variant="outline" /> : undefined} />
      {!items.length ? (
        <EmptyState icon={<Bell className="size-6" />} title={d.notifications.empty} body={d.notifications.emptyBody} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
          {items.map((n) => {
            const info = describeNotification(n, d, locale);
            return (
              <li key={n.id} className="border-b border-slate-100 last:border-0">
                <Link href={info.href} className={cn("flex gap-3 px-5 py-4 hover:bg-slate-50", !n.read_at && "bg-brand-50/50")}>
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent-500")} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{info.title}</p>
                    <p className="text-sm text-slate-600">{info.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatRelative(n.created_at, locale)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/dashboard/notifications?page=${p}`} labels={{ previous: d.common.previous, next: d.common.next, pageOf: fmt(d.common.pageOf, { page, total: totalPages }) }} />
    </div>
  );
}

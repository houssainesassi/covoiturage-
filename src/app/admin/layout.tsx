import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { rentalsEnabled } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.admin.title };
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const supabase = await createClient();
  const { count } = await supabase.from("reports").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]);
  return (
    <div className="wf-admin mx-auto flex max-w-[92rem] flex-col lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 lg:px-6 lg:py-8">
      <aside className="sticky top-16 z-20 min-w-0 border-b border-slate-200 bg-sand-50/95 px-4 py-2.5 backdrop-blur-md sm:px-6 lg:top-[5.5rem] lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <AdminNav openReports={count ?? 0} rentals={rentalsEnabled()} />
      </aside>
      <div className="min-w-0 px-4 py-6 sm:px-6 lg:p-0">{children}</div>
    </div>
  );
}

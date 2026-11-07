import { requireAdmin } from "@/lib/auth";
import { AdminSidebar } from "@/components/dashboard/sidebar";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-10">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start"><AdminSidebar /></aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
